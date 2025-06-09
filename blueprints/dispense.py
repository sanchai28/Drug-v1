from flask import Blueprint, request, jsonify, current_app
from utils.db_helpers import db_execute_query, get_db_connection
from utils.date_helpers import thai_to_iso_date, iso_to_thai_date
from utils.transaction_utils import map_dispense_type_to_inventory_transaction_type
from mysql.connector import Error
from datetime import datetime
from io import BytesIO
import pandas as pd

from ..inventory import get_total_medicine_stock, _dispense_medicine_fefo # Corrected relative import

dispense_bp = Blueprint('dispense_bp', __name__, url_prefix='/api/dispense')

def _cancel_dispense_item_internal(dispense_item_id, cancelling_user_id, cursor, for_excel_update=False):
    try:
        item_to_cancel_query = """
            SELECT di.medicine_id, di.lot_number, di.expiry_date, di.quantity_dispensed, di.hos_guid,
                   dr.hcode, dr.dispense_record_number, dr.id as dispense_record_id, dr.dispense_type
            FROM dispense_items di
            JOIN dispense_records dr ON di.dispense_record_id = dr.id
            WHERE di.id = %s
        """
        item_to_cancel = db_execute_query(item_to_cancel_query, (dispense_item_id,), fetchone=True, cursor_to_use=cursor)

        if not item_to_cancel:
            current_app.logger.warning(f"Dispense item ID {dispense_item_id} not found for cancellation.")
            return False

        medicine_id = item_to_cancel['medicine_id']
        lot_number = item_to_cancel['lot_number']
        expiry_date_iso = str(item_to_cancel['expiry_date'])
        quantity_to_add_back = item_to_cancel['quantity_dispensed']
        dispense_hcode = item_to_cancel['hcode']
        dispense_ref_number = item_to_cancel['dispense_record_number'] or f"DSP-ITEM-CANCEL-{dispense_item_id}"
        original_dispense_record_id = item_to_cancel['dispense_record_id']
        item_hos_guid = item_to_cancel['hos_guid']
        original_dispense_type_from_record = item_to_cancel['dispense_type']
        inventory_transaction_type_to_match = map_dispense_type_to_inventory_transaction_type(original_dispense_type_from_record)

        inv_item = db_execute_query(
            "SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s",
            (dispense_hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor
        )
        if inv_item:
            db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s",
                             (quantity_to_add_back, inv_item['id']), commit=False, cursor_to_use=cursor)
        else:
            db_execute_query("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, CURDATE())",
                             (dispense_hcode, medicine_id, lot_number, expiry_date_iso, quantity_to_add_back), commit=False, cursor_to_use=cursor)

        delete_txn_conditions = [
            "hcode = %s", "medicine_id = %s", "lot_number = %s",
            "expiry_date = %s", "reference_document_id = %s",
            "quantity_change = %s",
            "transaction_type = %s"
        ]
        delete_txn_params = [
            dispense_hcode, medicine_id, lot_number, expiry_date_iso,
            dispense_ref_number, -quantity_to_add_back, inventory_transaction_type_to_match
        ]

        if item_hos_guid:
            delete_txn_conditions.append("external_reference_guid = %s")
            delete_txn_params.append(item_hos_guid)

        delete_inventory_transaction_query = f"""
            DELETE FROM inventory_transactions
            WHERE {" AND ".join(delete_txn_conditions)}
            ORDER BY id DESC LIMIT 1
        """
        current_app.logger.debug(f"Attempting to delete inventory_transaction with query: {delete_inventory_transaction_query} and params: {tuple(delete_txn_params)}")
        cursor.execute(delete_inventory_transaction_query, tuple(delete_txn_params))
        if cursor.rowcount == 0:
            current_app.logger.warning(f"No inventory_transaction found to delete for dispense_item_id {dispense_item_id} with criteria. Stock was still adjusted.")
        else:
            current_app.logger.info(f"Deleted {cursor.rowcount} inventory_transaction(s) for dispense_item_id {dispense_item_id}.")

        if for_excel_update:
            db_execute_query("UPDATE dispense_items SET item_status = 'ถูกแทนที่โดย Excel', updated_at = NOW() WHERE id = %s",
                             (dispense_item_id,), commit=False, cursor_to_use=cursor)

            active_items_left = db_execute_query(
                "SELECT COUNT(*) as count FROM dispense_items WHERE dispense_record_id = %s AND item_status = 'ปกติ'",
                (original_dispense_record_id,), fetchone=True, cursor_to_use=cursor
            )
            if active_items_left and active_items_left['count'] == 0:
                db_execute_query(
                    "UPDATE dispense_records SET status = 'ปรับปรุงจาก Excel', remarks = CONCAT(COALESCE(remarks, ''), ' (รายการทั้งหมดถูกปรับปรุงผ่าน Excel)') WHERE id = %s AND status != 'ยกเลิก'",
                    (original_dispense_record_id,), commit=False, cursor_to_use=cursor
                )
        return True
    except Error as e:
        current_app.logger.error(f"Error in _cancel_dispense_item_internal for item {dispense_item_id}: {e}", exc_info=True)
        return False
    except Exception as ex_gen:
        current_app.logger.error(f"General error in _cancel_dispense_item_internal for item {dispense_item_id}: {ex_gen}", exc_info=True)
        return False

@dispense_bp.route('/manual', methods=['POST'])
def manual_dispense():
    data = request.get_json()
    if not data or not all(k in data for k in ['dispense_date', 'dispenser_id', 'hcode', 'items']) or not data['items']:
        return jsonify({"error": "ข้อมูลไม่ครบถ้วนสำหรับการตัดจ่ายยา"}), 400

    dispenser_id = data['dispenser_id']
    hcode = data['hcode']
    dispense_date_iso = thai_to_iso_date(data['dispense_date'])
    dispense_type = data.get('dispense_type', 'ผู้ป่วยนอก')
    remarks_header = data.get('remarks', '')

    if not dispense_date_iso:
        return jsonify({"error": "รูปแบบวันที่จ่ายยาไม่ถูกต้อง"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()

        current_date_str_disp = datetime.now().strftime('%y%m%d')
        cursor.execute("SELECT dispense_record_number FROM dispense_records WHERE hcode = %s AND dispense_record_number LIKE %s ORDER BY id DESC LIMIT 1", (hcode, f"DSP-{hcode}-{current_date_str_disp}-%",))
        last_disp_rec = cursor.fetchone()
        next_disp_seq = 1
        if last_disp_rec:
            try: next_disp_seq = int(last_disp_rec['dispense_record_number'].split('-')[-1]) + 1
            except (IndexError, ValueError): pass
        dispense_record_number = f"DSP-{hcode}-{current_date_str_disp}-{next_disp_seq:03d}"

        sql_dispense_record = "INSERT INTO dispense_records (hcode, dispense_record_number, dispense_date, dispenser_id, remarks, dispense_type, status) VALUES (%s, %s, %s, %s, %s, %s, 'ปกติ')"
        cursor.execute(sql_dispense_record, (hcode, dispense_record_number, dispense_date_iso, dispenser_id, remarks_header, dispense_type))
        dispense_record_id = cursor.lastrowid

        for item_data in data['items']:
            medicine_id = item_data.get('medicine_id')
            quantity_requested = item_data.get('quantity_dispensed')
            item_hos_guid = item_data.get('hos_guid')

            if not medicine_id or not quantity_requested:
                conn.rollback()
                return jsonify({"error": f"ข้อมูลรายการยาไม่ครบถ้วน (medicine_id, quantity_dispensed): {item_data}"}), 400
            try:
                quantity_requested = int(quantity_requested)
                if quantity_requested <= 0:
                    conn.rollback()
                    return jsonify({"error": "จำนวนที่จ่ายต้องมากกว่า 0"}), 400
            except ValueError:
                conn.rollback()
                return jsonify({"error": "จำนวนที่จ่ายต้องเป็นตัวเลข"}), 400

            success_fefo = _dispense_medicine_fefo(
                hcode, medicine_id, quantity_requested,
                dispense_record_id, dispenser_id, dispense_record_number,
                item_hos_guid, dispense_type, dispense_date_iso,
                cursor
            )
            if not success_fefo:
                conn.rollback()
                med_info = db_execute_query("SELECT generic_name FROM medicines WHERE id = %s", (medicine_id,), fetchone=True, cursor_to_use=cursor)
                med_name_for_error = med_info['generic_name'] if med_info else f"ID {medicine_id}"
                return jsonify({"error": f"ยา {med_name_for_error} ที่หน่วยบริการ {hcode} มีไม่เพียงพอในคลังตามหลัก FEFO"}), 400

        conn.commit()
        return jsonify({"message": "บันทึกการตัดจ่ายยาสำเร็จ", "dispense_record_id": dispense_record_id, "dispense_record_number": dispense_record_number}), 201

    except Error as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error during manual dispense: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        current_app.logger.error(f"General error during manual dispense: {ex}", exc_info=True)
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@dispense_bp.route('/records', methods=['GET'])
def get_dispense_records():
    user_hcode = request.args.get('hcode')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')

    if not user_hcode and request.args.get('user_role') != 'ผู้ดูแลระบบ':
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400

    query = """
        SELECT
            dr.id,
            dr.dispense_record_number,
            dr.dispense_date,
            u.full_name as dispenser_name,
            dr.dispense_type,
            dr.remarks,
            dr.hcode,
            dr.status,
            (SELECT COUNT(*) FROM dispense_items di WHERE di.dispense_record_id = dr.id AND di.item_status = 'ปกติ') as item_count
        FROM dispense_records dr
        JOIN users u ON dr.dispenser_id = u.id
    """
    params = []
    conditions = []

    if user_hcode:
        conditions.append("dr.hcode = %s")
        params.append(user_hcode)

    if start_date_thai:
        start_date_iso = thai_to_iso_date(start_date_thai)
        if start_date_iso:
            conditions.append("dr.dispense_date >= %s")
            params.append(start_date_iso)
    if end_date_thai:
        end_date_iso = thai_to_iso_date(end_date_thai)
        if end_date_iso:
            conditions.append("dr.dispense_date <= %s")
            params.append(end_date_iso)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY dr.dispense_date DESC, dr.id DESC"

    dispense_records = db_execute_query(query, tuple(params) if params else None, fetchall=True)

    if dispense_records is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลประวัติการตัดจ่ายยาได้"}), 500

    for record in dispense_records:
        record['dispense_date'] = iso_to_thai_date(record['dispense_date'])
    return jsonify(dispense_records)

@dispense_bp.route('/records/<int:record_id>', methods=['GET'])
def get_single_dispense_record(record_id):
    query = """
        SELECT
            dr.id, dr.dispense_record_number, dr.dispense_date, dr.dispenser_id,
            u.full_name as dispenser_name,
            dr.dispense_type, dr.remarks, dr.hcode, dr.status
        FROM dispense_records dr
        JOIN users u ON dr.dispenser_id = u.id
        WHERE dr.id = %s
    """
    record = db_execute_query(query, (record_id,), fetchone=True)
    if not record:
        return jsonify({"error": "ไม่พบเอกสารการตัดจ่ายยา"}), 404
    record['dispense_date_thai'] = iso_to_thai_date(record['dispense_date'])
    return jsonify(record)

@dispense_bp.route('/records/<int:record_id>/items', methods=['GET'])
def get_dispense_record_items(record_id):
    dispense_header = db_execute_query("SELECT hcode FROM dispense_records WHERE id = %s", (record_id,), fetchone=True)
    if not dispense_header:
        return jsonify({"error": "ไม่พบเอกสารตัดจ่าย"}), 404
    dispense_hcode = dispense_header['hcode']

    query = """
        SELECT
            di.id as dispense_item_id,
            m.id as medicine_id,
            m.medicine_code,
            m.generic_name,
            m.strength,
            m.unit,
            di.lot_number,
            di.expiry_date,
            di.quantity_dispensed,
            di.hos_guid,
            di.item_status
        FROM dispense_items di
        JOIN medicines m ON di.medicine_id = m.id
        WHERE di.dispense_record_id = %s AND m.hcode = %s AND di.item_status = 'ปกติ'
        ORDER BY m.generic_name;
    """
    items = db_execute_query(query, (record_id, dispense_hcode), fetchall=True)

    if items is None:
        return jsonify({"error": "ไม่สามารถดึงรายการยาของเอกสารตัดจ่ายนี้ได้"}), 500

    for item in items:
        item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
    return jsonify(items)

@dispense_bp.route('/records/<int:record_id>', methods=['PUT'])
def update_dispense_record(record_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400

    dispense_record = db_execute_query("SELECT id, hcode, status FROM dispense_records WHERE id = %s", (record_id,), fetchone=True)
    if not dispense_record:
        return jsonify({"error": "ไม่พบเอกสารตัดจ่าย"}), 404
    if dispense_record['status'] == 'ยกเลิก':
        return jsonify({"error": "ไม่สามารถแก้ไขเอกสารที่ถูกยกเลิกแล้วได้"}), 400
    if dispense_record['status'] == 'ปรับปรุงจาก Excel':
        return jsonify({"error": "ไม่สามารถแก้ไขหัวเอกสารนี้ได้เนื่องจากมีการปรับปรุงรายการผ่าน Excel"}), 400

    new_dispense_date_iso = thai_to_iso_date(data.get('dispense_date'))
    new_remarks = data.get('remarks')
    new_dispense_type = data.get('dispense_type')

    update_fields = []
    params = []
    if new_dispense_date_iso:
        update_fields.append("dispense_date = %s")
        params.append(new_dispense_date_iso)
    if new_remarks is not None:
        update_fields.append("remarks = %s")
        params.append(new_remarks)
    if new_dispense_type:
        update_fields.append("dispense_type = %s")
        params.append(new_dispense_type)

    if not update_fields:
        return jsonify({"message": "ไม่มีข้อมูลให้อัปเดต"}), 200

    params.append(record_id)
    query = f"UPDATE dispense_records SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s"

    db_execute_query(query, tuple(params), commit=True)
    return jsonify({"message": f"อัปเดตข้อมูลเอกสารตัดจ่าย ID {record_id} สำเร็จ"})

@dispense_bp.route('/records/<int:record_id>', methods=['DELETE'])
def delete_dispense_record(record_id):
    cancelling_user_id = request.args.get('user_id_context', type=int)
    if not cancelling_user_id:
        return jsonify({"error": "ไม่สามารถระบุผู้ดำเนินการได้"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()

        dispense_record = db_execute_query("SELECT id, hcode, dispense_record_number, status, dispense_type FROM dispense_records WHERE id = %s", (record_id,), fetchone=True, cursor_to_use=cursor)
        if not dispense_record:
            conn.rollback()
            return jsonify({"error": "ไม่พบเอกสารตัดจ่าย"}), 404

        dispensed_items = db_execute_query("SELECT id as dispense_item_id, medicine_id, lot_number, expiry_date, quantity_dispensed, hos_guid, item_status FROM dispense_items WHERE dispense_record_id = %s", (record_id,), fetchall=True, cursor_to_use=cursor)

        for item in dispensed_items:
            if item['item_status'] == 'ปกติ' or item['item_status'] == 'ถูกแทนที่โดย Excel':
                medicine_id = item['medicine_id']
                lot_number = item['lot_number']
                expiry_date_iso = str(item['expiry_date'])
                quantity_to_add_back = item['quantity_dispensed']
                item_hos_guid = item['hos_guid']
                dispense_hcode = dispense_record['hcode']
                dispense_ref_number = dispense_record['dispense_record_number'] or f"DSP-DEL-{record_id}"
                original_dispense_type_for_txn_lookup = map_dispense_type_to_inventory_transaction_type(dispense_record['dispense_type'])

                inv_item_db = db_execute_query(
                    "SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s",
                    (dispense_hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor
                )
                if inv_item_db:
                    db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s",
                                     (quantity_to_add_back, inv_item_db['id']), commit=False, cursor_to_use=cursor)
                else:
                    db_execute_query("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, CURDATE())",
                                     (dispense_hcode, medicine_id, lot_number, expiry_date_iso, quantity_to_add_back), commit=False, cursor_to_use=cursor)

                delete_txn_conditions = [
                    "hcode = %s", "medicine_id = %s", "lot_number = %s",
                    "expiry_date = %s", "reference_document_id = %s",
                    "quantity_change = %s", "transaction_type = %s"
                ]
                delete_txn_params = [
                    dispense_hcode, medicine_id, lot_number, expiry_date_iso,
                    dispense_ref_number, -quantity_to_add_back, original_dispense_type_for_txn_lookup
                ]
                if item_hos_guid:
                    delete_txn_conditions.append("external_reference_guid = %s")
                    delete_txn_params.append(item_hos_guid)

                delete_inventory_transaction_query = f"DELETE FROM inventory_transactions WHERE {' AND '.join(delete_txn_conditions)}"
                current_app.logger.debug(f"Attempting to delete inventory_transaction for dispense with query: {delete_inventory_transaction_query} and params: {tuple(delete_txn_params)}")
                cursor.execute(delete_inventory_transaction_query, tuple(delete_txn_params))
                if cursor.rowcount == 0:
                    current_app.logger.warning(f"No inventory_transaction found to delete for dispense_item_id {item['dispense_item_id']} with criteria. Stock was still adjusted (or attempted).")
                else:
                    current_app.logger.info(f"Deleted {cursor.rowcount} inventory_transaction(s) for dispense_item_id {item['dispense_item_id']}.")

        db_execute_query("DELETE FROM dispense_items WHERE dispense_record_id = %s", (record_id,), commit=False, cursor_to_use=cursor)
        db_execute_query("DELETE FROM dispense_records WHERE id = %s", (record_id,), commit=False, cursor_to_use=cursor)

        conn.commit()
        return jsonify({"message": f"ลบเอกสารตัดจ่าย ID {record_id} และข้อมูลที่เกี่ยวข้องทั้งหมดออกจากระบบแล้ว (Hard Delete)"})
    except Error as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error during dispense record hard delete: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        current_app.logger.error(f"General error during dispense record hard delete: {ex}", exc_info=True)
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@dispense_bp.route('/upload_excel/preview', methods=['POST'])
def dispense_upload_excel_preview():
    if 'file' not in request.files:
        return jsonify({"error": "ไม่พบไฟล์ที่อัปโหลด"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "ไม่ได้เลือกไฟล์"}), 400

    hcode = request.form.get('hcode')
    if not hcode:
        return jsonify({"error": "กรุณาระบุ hcode"}), 400

    preview_items = []
    try:
        excel_data = pd.read_excel(BytesIO(file.read()), engine='openpyxl')

        required_columns = ['วันที่', 'รหัสยา', 'จำนวน']
        has_hos_guid_column = 'hos_guid' in excel_data.columns

        for col in required_columns:
            if col not in excel_data.columns:
                return jsonify({"error": f"ไฟล์ Excel ต้องมีคอลัมน์: {', '.join(required_columns)}"}), 400

        if excel_data.empty:
            return jsonify({"error": "ไฟล์ Excel ไม่มีข้อมูล"}), 400

        conn = get_db_connection()
        if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
        cursor = conn.cursor(dictionary=True)

        for index, row in excel_data.iterrows():
            row_num = index + 2

            dispense_date_from_excel = row['วันที่']
            dispense_date_str_for_preview = ""
            dispense_date_iso_for_logic = None

            if isinstance(dispense_date_from_excel, datetime):
                dispense_date_str_for_preview = f"{dispense_date_from_excel.day:02d}/{dispense_date_from_excel.month:02d}/{dispense_date_from_excel.year + 543}"
                dispense_date_iso_for_logic = dispense_date_from_excel.strftime('%Y-%m-%d')
            else:
                dispense_date_str_for_preview = str(dispense_date_from_excel).strip()
                dispense_date_iso_for_logic = thai_to_iso_date(dispense_date_str_for_preview)

            item_preview = {
                "row_num": row_num,
                "dispense_date_str": dispense_date_str_for_preview,
                "dispense_date_iso": dispense_date_iso_for_logic,
                "medicine_code": str(row['รหัสยา']).strip(),
                "quantity_requested_str": str(row['จำนวน']).strip(),
                "hos_guid": str(row['hos_guid']).strip() if has_hos_guid_column and pd.notna(row['hos_guid']) else None,
                "medicine_name": "N/A",
                "unit": "N/A",
                "available_lots_info_for_preview": [],
                "status": "รอตรวจสอบ",
                "errors": []
            }

            if not item_preview["dispense_date_iso"]:
                item_preview["errors"].append("รูปแบบวันที่จ่ายไม่ถูกต้อง (ต้องเป็น dd/mm/yyyy พ.ศ. หรือ燜-MM-DD ค.ศ.)")

            try:
                item_preview["quantity_requested"] = int(item_preview["quantity_requested_str"])
                if item_preview["quantity_requested"] <= 0:
                    item_preview["errors"].append("จำนวนต้องมากกว่า 0")
            except ValueError:
                item_preview["errors"].append("จำนวนต้องเป็นตัวเลข")

            if not item_preview["errors"]:
                medicine_info = db_execute_query(
                    "SELECT id, generic_name, strength, unit FROM medicines WHERE medicine_code = %s AND hcode = %s AND is_active = TRUE",
                    (item_preview["medicine_code"], hcode), fetchone=True, cursor_to_use=cursor
                )
                if medicine_info:
                    item_preview["medicine_id"] = medicine_info['id']
                    item_preview["medicine_name"] = f"{medicine_info['generic_name']} ({medicine_info['strength'] or 'N/A'})"
                    item_preview["unit"] = medicine_info['unit']

                    lots_query = "SELECT lot_number, expiry_date, quantity_on_hand FROM inventory WHERE medicine_id = %s AND hcode = %s AND quantity_on_hand > 0 ORDER BY expiry_date ASC, id ASC;"
                    available_lots_db = db_execute_query(lots_query, (medicine_info['id'], hcode), fetchall=True, cursor_to_use=cursor)

                    total_available_stock = sum(lot['quantity_on_hand'] for lot in available_lots_db)

                    if total_available_stock >= item_preview["quantity_requested"]:
                        item_preview["status"] = "พร้อมจ่าย (FEFO)"
                        temp_qty_needed = item_preview["quantity_requested"]
                        for lot_db in available_lots_db:
                            if temp_qty_needed <= 0: break
                            qty_from_this_lot = min(temp_qty_needed, lot_db["quantity_on_hand"])
                            item_preview["available_lots_info_for_preview"].append(
                                f"Lot: {lot_db['lot_number']} (Exp: {iso_to_thai_date(lot_db['expiry_date'])}, Qty Avail: {lot_db['quantity_on_hand']}) - จะใช้: {qty_from_this_lot}"
                            )
                            temp_qty_needed -= qty_from_this_lot
                    else:
                        item_preview["errors"].append(f"สต็อกไม่เพียงพอ (มี {total_available_stock}, ต้องการ {item_preview['quantity_requested']})")
                        item_preview["available_lots_info_for_preview"].append(f"สต็อกรวม: {total_available_stock}")

                else:
                    item_preview["errors"].append(f"ไม่พบรหัสยา '{item_preview['medicine_code']}' หรือยาไม่ถูกเปิดใช้งาน สำหรับหน่วยบริการ {hcode}")

            if item_preview["hos_guid"] and not item_preview["errors"]:
                existing_item_check_query = """
                    SELECT di.quantity_dispensed, dr.status as record_status, di.item_status
                    FROM dispense_items di
                    JOIN dispense_records dr ON di.dispense_record_id = dr.id
                    WHERE di.hos_guid = %s AND dr.hcode = %s AND dr.status != 'ยกเลิก' AND di.item_status = 'ปกติ'
                    LIMIT 1
                """
                checked_item = db_execute_query(existing_item_check_query, (item_preview["hos_guid"], hcode), fetchone=True, cursor_to_use=cursor)
                if checked_item:
                    item_preview["existing_quantity"] = checked_item["quantity_dispensed"]
                    if item_preview["quantity_requested"] == checked_item["quantity_dispensed"]:
                        item_preview["status"] = "รายการซ้ำ (hos_guid) และจำนวนเท่าเดิม (จะถูกข้าม)"
                    else:
                        item_preview["status"] = "รายการซ้ำ (hos_guid) และจำนวนแตกต่าง (จะถูกอัปเดตตาม FEFO)"

            if item_preview["errors"]:
                 item_preview["status"] = "มีข้อผิดพลาด"

            preview_items.append(item_preview)

        return jsonify({"preview_items": preview_items}), 200

    except Exception as e:
        current_app.logger.error(f"Error processing Excel preview: {str(e)}", exc_info=True)
        return jsonify({"error": f"เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: {str(e)}"}), 500
    finally:
        if 'conn' in locals() and conn and conn.is_connected():
            if 'cursor' in locals() and cursor:
                cursor.close()
            conn.close()

@dispense_bp.route('/process_excel_dispense', methods=['POST'])
def process_excel_dispense():
    data = request.get_json()
    if not data or not data.get('dispense_items') or not data.get('dispenser_id') or not data.get('hcode'):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วนสำหรับการยืนยันการตัดจ่าย"}), 400

    items_to_process_original = data['dispense_items']
    dispenser_id = data['dispenser_id']
    hcode = data['hcode']
    dispense_type_header = data.get('dispense_type_header', 'ผู้ป่วยนอก (Excel)')
    remarks_header = data.get('remarks_header', 'ตัดจ่ายยาจากไฟล์ Excel (FEFO)')

    try:
        items_to_process = sorted(
            items_to_process_original,
            key=lambda x: (datetime.strptime(x['dispense_date_iso'], '%Y-%m-%d').date() if x.get('dispense_date_iso') else datetime.min.date(), x.get('row_num', 0))
        )
    except (ValueError, TypeError) as e:
        current_app.logger.error(f"Error sorting dispense items by date: {e}. Items: {items_to_process_original}")
        return jsonify({"error": "มีข้อผิดพลาดในการเรียงลำดับข้อมูลรายการยาตามวันที่"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    processed_count = 0
    failed_items_details = []
    updated_hos_guids = []
    skipped_hos_guids_same_qty = []

    try:
        conn.start_transaction()

        overall_dispense_date_iso_str = datetime.now().strftime('%Y-%m-%d')
        if items_to_process and items_to_process[0].get('dispense_date_iso'):
            temp_date_str = items_to_process[0]['dispense_date_iso']
            try:
                datetime.strptime(temp_date_str, '%Y-%m-%d')
                overall_dispense_date_iso_str = temp_date_str
            except (ValueError, TypeError):
                current_app.logger.warning(f"Invalid overall_dispense_date_iso from first sorted item: {temp_date_str}, using current date.")

        current_date_str_disp = datetime.now().strftime('%y%m%d')
        cursor.execute("SELECT dispense_record_number FROM dispense_records WHERE hcode = %s AND dispense_record_number LIKE %s ORDER BY id DESC LIMIT 1", (hcode, f"DSPEXC-{hcode}-{current_date_str_disp}-%",))
        last_disp_rec = cursor.fetchone()
        next_disp_seq = 1
        if last_disp_rec:
            try: next_disp_seq = int(last_disp_rec['dispense_record_number'].split('-')[-1]) + 1
            except (IndexError, ValueError): pass
        dispense_record_number = f"DSPEXC-{hcode}-{current_date_str_disp}-{next_disp_seq:03d}"

        sql_dispense_record = "INSERT INTO dispense_records (hcode, dispense_record_number, dispense_date, dispenser_id, remarks, dispense_type, status) VALUES (%s, %s, %s, %s, %s, %s, 'ปกติ')"
        cursor.execute(sql_dispense_record, (hcode, dispense_record_number, overall_dispense_date_iso_str, dispenser_id, remarks_header, dispense_type_header))
        dispense_record_id = cursor.lastrowid

        for item_data in items_to_process:
            hos_guid = item_data.get('hos_guid')
            medicine_id = item_data.get('medicine_id')
            quantity_requested = item_data.get('quantity_dispensed')
            item_dispense_date_iso = item_data.get('dispense_date_iso', overall_dispense_date_iso_str)

            if not all([medicine_id, quantity_requested, item_dispense_date_iso]):
                failed_items_details.append({"hos_guid": hos_guid, "medicine_code": item_data.get("medicine_code", "N/A"), "error": "ข้อมูลไม่ครบถ้วน (ยา, จำนวน, หรือวันที่จ่าย)"})
                continue
            try:
                quantity_requested = int(quantity_requested)
                if quantity_requested <= 0:
                    failed_items_details.append({"hos_guid": hos_guid, "medicine_code": item_data.get("medicine_code"), "error": "จำนวนจ่ายต้องมากกว่า 0"})
                    continue
            except ValueError:
                failed_items_details.append({"hos_guid": hos_guid, "medicine_code": item_data.get("medicine_code"), "error": "จำนวนจ่ายไม่ถูกต้อง"})
                continue
            try:
                datetime.strptime(item_dispense_date_iso, '%Y-%m-%d')
            except (ValueError, TypeError):
                failed_items_details.append({"hos_guid": hos_guid, "medicine_code": item_data.get("medicine_code"), "error": "รูปแบบวันที่จ่ายไม่ถูกต้อง"})
                continue

            if hos_guid:
                existing_item_query = """
                    SELECT di.id as dispense_item_id, di.quantity_dispensed
                    FROM dispense_items di
                    JOIN dispense_records dr ON di.dispense_record_id = dr.id
                    WHERE di.hos_guid = %s AND dr.hcode = %s AND dr.status != 'ยกเลิก' AND di.item_status = 'ปกติ'
                """
                existing_items_with_guid = db_execute_query(existing_item_query, (hos_guid, hcode), fetchall=True, cursor_to_use=cursor)

                if existing_items_with_guid:
                    total_existing_qty = sum(ex_item['quantity_dispensed'] for ex_item in existing_items_with_guid)
                    if total_existing_qty == quantity_requested:
                        skipped_hos_guids_same_qty.append(hos_guid)
                        continue
                    else:
                        for ex_item_to_cancel in existing_items_with_guid:
                            success_cancel_old = _cancel_dispense_item_internal(ex_item_to_cancel['dispense_item_id'], dispenser_id, cursor, for_excel_update=True)
                            if not success_cancel_old:
                                failed_items_details.append({"hos_guid": hos_guid, "medicine_code": item_data.get("medicine_code"), "error": "ไม่สามารถยกเลิกรายการเก่าเพื่ออัปเดตได้"})
                                conn.rollback()
                                return jsonify({"error": f"เกิดข้อผิดพลาดขณะยกเลิกรายการเก่าสำหรับ hos_guid {hos_guid}", "details": failed_items_details}), 500
                        updated_hos_guids.append(hos_guid)

            success_fefo_dispense = _dispense_medicine_fefo(
                hcode, medicine_id, quantity_requested,
                dispense_record_id, dispenser_id, dispense_record_number,
                hos_guid, dispense_type_header, item_dispense_date_iso,
                cursor
            )

            if success_fefo_dispense:
                processed_count += 1
            else:
                failed_items_details.append({"hos_guid": hos_guid, "medicine_code": item_data.get("medicine_code", "N/A"), "error": "สต็อกไม่เพียงพอตาม FEFO หรือเกิดข้อผิดพลาดในการจ่ายยา"})

        if processed_count == 0 and items_to_process and not skipped_hos_guids_same_qty:
            if dispense_record_id and processed_count == 0 and not updated_hos_guids :
                db_execute_query("DELETE FROM dispense_records WHERE id = %s", (dispense_record_id,), commit=False, cursor_to_use=cursor)
                current_app.logger.info(f"Deleted empty dispense record {dispense_record_id} as no items were processed.")
                dispense_record_id = None
                dispense_record_number = None

        conn.commit()
        message = f"บันทึกการตัดจ่ายยาจาก Excel สำเร็จ {processed_count} รายการ."
        if updated_hos_guids: message += f" อัปเดต (แทนที่รายการเก่า) {len(updated_hos_guids)} รายการ (hos_guid)."
        if skipped_hos_guids_same_qty: message += f" ข้าม {len(skipped_hos_guids_same_qty)} รายการซ้ำ (hos_guid) ที่มีจำนวนเท่าเดิม."
        if failed_items_details: message += f" พบข้อผิดพลาด {len(failed_items_details)} รายการที่ไม่ถูกบันทึก."

        status_code = 201
        if failed_items_details and processed_count > 0 : status_code = 207
        elif failed_items_details and processed_count == 0 and items_to_process : status_code = 400

        return jsonify({
            "message": message,
            "dispense_record_id": dispense_record_id,
            "dispense_record_number": dispense_record_number,
            "processed_count": processed_count,
            "updated_hos_guids": updated_hos_guids,
            "skipped_hos_guids_same_qty": skipped_hos_guids_same_qty,
            "failed_details": failed_items_details
        }), status_code

    except Error as e_db:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error during Excel dispense processing: {str(e_db)}", exc_info=True)
        return jsonify({"error": f"Database error: {str(e_db)}"}), 500
    except Exception as e_main:
        if conn: conn.rollback()
        current_app.logger.error(f"General error during Excel dispense processing: {str(e_main)}", exc_info=True)
        return jsonify({"error": f"General error: {str(e_main)}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
