# /blueprints/dispense.py

from flask import Blueprint, request, jsonify
from helpers.database import db_execute_query, get_db_connection
from helpers.utils import thai_to_iso_date, iso_to_thai_date
from datetime import datetime
from mysql.connector import Error
import pandas as pd
from io import BytesIO
import logging

# ตั้งค่า logging เพื่อช่วยในการดีบัก
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# สร้าง Blueprint สำหรับ dispense
dispense_bp = Blueprint('dispense', __name__, url_prefix='/api')

# --- Helper Functions Specific to Dispensing ---

def get_total_medicine_stock(hcode, medicine_id, cursor):
    """ฟังก์ชันผู้ช่วยสำหรับดึงยอดคงเหลือรวมของยาที่ระบุ"""
    stock_query = "SELECT COALESCE(SUM(quantity_on_hand), 0) as total_stock FROM inventory WHERE hcode = %s AND medicine_id = %s"
    stock_data = db_execute_query(stock_query, (hcode, medicine_id), fetchone=True, cursor_to_use=cursor)
    return stock_data['total_stock'] if stock_data else 0

def map_dispense_type_to_inventory_transaction_type(dispense_type_from_record):
    """แปลงประเภทการจ่าย (dispense_type) เป็นประเภท Transaction ใน inventory"""
    if dispense_type_from_record is None:
        return 'อื่นๆ'
    if dispense_type_from_record.endswith('(Excel)'):
        return 'จ่ายออก-Excel'
    elif dispense_type_from_record in ['ผู้ป่วยนอก', 'ผู้ป่วยใน', 'หน่วยงานภายใน', 'หมดอายุ']:
        return 'จ่ายออก-ผู้ป่วย'
    return 'อื่นๆ'

def _dispense_medicine_fefo(hcode, medicine_id, quantity_to_dispense, dispense_record_id, dispenser_id, dispense_record_number, hos_guid, dispense_type_from_record, item_dispense_date_iso, cursor):
    """
    Logic หลักในการตัดจ่ายยาตามหลัก FEFO (First-Expired, First-Out)
    ฟังก์ชันนี้จะจัดการการอัปเดต inventory และสร้าง transaction log
    """
    remaining_qty_to_dispense = quantity_to_dispense
    available_lots_query = "SELECT id as inventory_id, lot_number, expiry_date, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND quantity_on_hand > 0 ORDER BY expiry_date ASC, id ASC"
    available_lots = db_execute_query(available_lots_query, (hcode, medicine_id), fetchall=True, cursor_to_use=cursor)

    total_stock_for_med = sum(lot['quantity_on_hand'] for lot in available_lots)
    if total_stock_for_med < remaining_qty_to_dispense:
        logger.warning(f"FEFO: Insufficient stock for medicine_id {medicine_id}. Needed {quantity_to_dispense}, available {total_stock_for_med}.")
        return False

    dispensed_from_lots_info = []
    inventory_transaction_type = map_dispense_type_to_inventory_transaction_type(dispense_type_from_record)

    for lot in available_lots:
        if remaining_qty_to_dispense <= 0: break
        qty_to_take_from_this_lot = min(remaining_qty_to_dispense, lot['quantity_on_hand'])
        dispensed_from_lots_info.append({
            'lot_number': lot['lot_number'],
            'expiry_date_iso': str(lot['expiry_date']),
            'quantity_dispensed_from_lot': qty_to_take_from_this_lot
        })
        
        stock_before_txn = get_total_medicine_stock(hcode, medicine_id, cursor)
        db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand - %s WHERE id = %s", (qty_to_take_from_this_lot, lot['inventory_id']), commit=False, cursor_to_use=cursor)
        stock_after_txn = get_total_medicine_stock(hcode, medicine_id, cursor)
        
        transaction_datetime = f"{item_dispense_date_iso} {datetime.now().strftime('%H:%M:%S')}"
        db_execute_query(
            "INSERT INTO inventory_transactions (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, quantity_before_transaction, quantity_after_transaction, reference_document_id, external_reference_guid, user_id, remarks, transaction_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (hcode, medicine_id, lot['lot_number'], str(lot['expiry_date']), inventory_transaction_type, -qty_to_take_from_this_lot, stock_before_txn, stock_after_txn, dispense_record_number, hos_guid, dispenser_id, f"FEFO Dispense (Lot: {lot['lot_number']})", transaction_datetime),
            commit=False, cursor_to_use=cursor
        )
        remaining_qty_to_dispense -= qty_to_take_from_this_lot

    for lot_info in dispensed_from_lots_info:
        db_execute_query(
            "INSERT INTO dispense_items (dispense_record_id, medicine_id, lot_number, expiry_date, quantity_dispensed, dispense_date, hos_guid, item_status) VALUES (%s, %s, %s, %s, %s, %s, %s, 'ปกติ')",
            (dispense_record_id, medicine_id, lot_info['lot_number'], lot_info['expiry_date_iso'], lot_info['quantity_dispensed_from_lot'], item_dispense_date_iso, hos_guid),
            commit=False, cursor_to_use=cursor
        )
    return True
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
            logger.warning(f"Dispense item ID {dispense_item_id} not found for cancellation.")
            return False 
        
        # Ensure we only "uncancel" items that were actually processed
        # For hard delete of transaction, this check on item_status might be different
        # if item_to_cancel['item_status'] != 'ปกติ' and not (for_excel_update and item_to_cancel['item_status'] == 'ถูกแทนที่โดย Excel'):
        #    app.logger.warning(f"Dispense item ID {dispense_item_id} is not in a cancellable state ('ปกติ' or 'ถูกแทนที่โดย Excel' for update). Current status: {item_to_cancel['item_status']}")
        #    return False


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
        logger.debug(f"Attempting to delete inventory_transaction with query: {delete_inventory_transaction_query} and params: {tuple(delete_txn_params)}")
        cursor.execute(delete_inventory_transaction_query, tuple(delete_txn_params))
        if cursor.rowcount == 0:
            logger.warning(f"No inventory_transaction found to delete for dispense_item_id {dispense_item_id} with criteria. Stock was still adjusted.")
        else:
            logger.info(f"Deleted {cursor.rowcount} inventory_transaction(s) for dispense_item_id {dispense_item_id}.")

        # If this function is only called before deleting the dispense_item, we don't need to update its status.
        # However, if it's for Excel update, the item itself is not deleted, so its status needs an update.
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
        logger.error(f"Error in _cancel_dispense_item_internal for item {dispense_item_id}: {e}", exc_info=True)
        return False
    except Exception as ex_gen:
        logger.error(f"General error in _cancel_dispense_item_internal for item {dispense_item_id}: {ex_gen}", exc_info=True)
        return False
# --- API Endpoints ---

@dispense_bp.route('/dispense/manual', methods=['POST'])
def manual_dispense():
    """Endpoint สำหรับการตัดจ่ายยาด้วยตนเอง"""
    data = request.get_json()
    if not data or not all(k in data for k in ['dispense_date', 'dispenser_id', 'hcode', 'items']) or not data['items']:
        return jsonify({"error": "ข้อมูลไม่ครบถ้วนสำหรับการตัดจ่ายยา"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        dispense_date_iso = thai_to_iso_date(data['dispense_date'])
        if not dispense_date_iso:
            conn.rollback()
            return jsonify({"error": "รูปแบบวันที่จ่ายยาไม่ถูกต้อง"}), 400

        current_date_str = datetime.now().strftime('%y%m%d')
        cursor.execute("SELECT dispense_record_number FROM dispense_records WHERE hcode = %s AND dispense_record_number LIKE %s ORDER BY id DESC LIMIT 1", (data['hcode'], f"DSP-{data['hcode']}-{current_date_str}-%"))
        last_rec = cursor.fetchone()
        next_seq = 1
        if last_rec:
            try: next_seq = int(last_rec['dispense_record_number'].split('-')[-1]) + 1
            except (IndexError, ValueError): pass
        dispense_record_number = f"DSP-{data['hcode']}-{current_date_str}-{next_seq:03d}"

        sql_disp_rec = "INSERT INTO dispense_records (hcode, dispense_record_number, dispense_date, dispenser_id, remarks, dispense_type, status) VALUES (%s, %s, %s, %s, %s, %s, 'ปกติ')"
        cursor.execute(sql_disp_rec, (data['hcode'], dispense_record_number, dispense_date_iso, data['dispenser_id'], data.get('remarks', ''), data.get('dispense_type', 'ผู้ป่วยนอก')))
        dispense_record_id = cursor.lastrowid

        for item in data['items']:
            success = _dispense_medicine_fefo(
                hcode=data['hcode'], medicine_id=item['medicine_id'], quantity_to_dispense=int(item['quantity_dispensed']),
                dispense_record_id=dispense_record_id, dispenser_id=data['dispenser_id'],
                dispense_record_number=dispense_record_number, hos_guid=item.get('hos_guid'),
                dispense_type_from_record=data.get('dispense_type', 'ผู้ป่วยนอก'), item_dispense_date_iso=dispense_date_iso,
                cursor=cursor
            )
            if not success:
                conn.rollback()
                med_info = db_execute_query("SELECT generic_name FROM medicines WHERE id = %s", (item['medicine_id'],), fetchone=True, cursor_to_use=cursor)
                med_name = med_info['generic_name'] if med_info else f"ID {item['medicine_id']}"
                return jsonify({"error": f"ยา {med_name} มีไม่เพียงพอในคลังตามหลัก FEFO"}), 400

        conn.commit()
        return jsonify({"message": "บันทึกการตัดจ่ายยาสำเร็จ", "dispense_record_id": dispense_record_id, "dispense_record_number": dispense_record_number}), 201

    except Error as e:
        if conn: conn.rollback()
        logger.error(f"DB Error in manual_dispense: {e}", exc_info=True)
        return jsonify({"error": f"Database Error: {e}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@dispense_bp.route('/dispense_records', methods=['GET'])
def get_dispense_records():
    """ดึงประวัติการตัดจ่ายยา"""
    user_hcode = request.args.get('hcode')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')
    
    query = """
        SELECT dr.id, dr.dispense_record_number, dr.dispense_date, u.full_name as dispenser_name,
               dr.dispense_type, dr.remarks, dr.hcode, dr.status, dr.created_at,
               (SELECT COUNT(*) FROM dispense_items di WHERE di.dispense_record_id = dr.id AND di.item_status = 'ปกติ') as item_count
        FROM dispense_records dr JOIN users u ON dr.dispenser_id = u.id
    """
    conditions, params = [], []
    if user_hcode:
        conditions.append("dr.hcode = %s")
        params.append(user_hcode)
    if start_date_thai and (start_iso := thai_to_iso_date(start_date_thai)):
        conditions.append("dr.dispense_date >= %s")
        params.append(start_iso)
    if end_date_thai and (end_iso := thai_to_iso_date(end_date_thai)):
        conditions.append("dr.dispense_date <= %s")
        params.append(end_iso)

    if conditions: query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY dr.dispense_date DESC, dr.id DESC"
    
    records = db_execute_query(query, tuple(params) if params else None, fetchall=True)
    if records is None: return jsonify({"error": "ไม่สามารถดึงข้อมูลได้"}), 500
    for record in records:
        record['dispense_date'] = iso_to_thai_date(record['dispense_date'])
        record['created_at'] = iso_to_thai_date(record['created_at'])
    return jsonify(records)


@dispense_bp.route('/dispense_records/<int:record_id>', methods=['GET'])
def get_single_dispense_record(record_id):
    """ดึงข้อมูลเอกสารตัดจ่ายใบเดียว"""
    query = "SELECT dr.*, u.full_name as dispenser_name FROM dispense_records dr JOIN users u ON dr.dispenser_id = u.id WHERE dr.id = %s"
    record = db_execute_query(query, (record_id,), fetchone=True)
    if not record: return jsonify({"error": "ไม่พบเอกสาร"}), 404
    record['dispense_date_thai'] = iso_to_thai_date(record['dispense_date'])
    return jsonify(record)


@dispense_bp.route('/dispense_records/<int:record_id>/items', methods=['GET'])
def get_dispense_record_items(record_id):
    """ดึงรายการยาทั้งหมดในเอกสารตัดจ่าย"""
    query = """
        SELECT di.id as dispense_item_id, m.id as medicine_id, m.medicine_code,
               m.generic_name, m.strength, m.unit, di.lot_number, di.expiry_date,
               di.quantity_dispensed, di.hos_guid, di.item_status, di.dispense_date
        FROM dispense_items di JOIN medicines m ON di.medicine_id = m.id
        WHERE di.dispense_record_id = %s AND di.item_status = 'ปกติ' ORDER BY m.generic_name;
    """
    items = db_execute_query(query, (record_id,), fetchall=True)
    if items is None: return jsonify({"error": "ไม่สามารถดึงข้อมูลรายการยาได้"}), 500
    for item in items:
        item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
        item['dispense_date_item_thai'] = iso_to_thai_date(item.get('dispense_date'))
    return jsonify(items)


@dispense_bp.route('/dispense_records/<int:record_id>', methods=['PUT'])
def update_dispense_record(record_id):
    """อัปเดตข้อมูลหัวเอกสารตัดจ่าย"""
    data = request.get_json()
    if not data: return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400
    
    record = db_execute_query("SELECT status FROM dispense_records WHERE id = %s", (record_id,), fetchone=True)
    if not record: return jsonify({"error": "ไม่พบเอกสาร"}), 404
    if record['status'] in ['ยกเลิก', 'ปรับปรุงจาก Excel']:
        return jsonify({"error": f"ไม่สามารถแก้ไขเอกสารนี้ได้เนื่องจากสถานะเป็น '{record['status']}'"}), 400

    update_fields, params = [], []
    if 'dispense_date' in data and (date_iso := thai_to_iso_date(data['dispense_date'])):
        update_fields.append("dispense_date = %s")
        params.append(date_iso)
    if 'remarks' in data:
        update_fields.append("remarks = %s")
        params.append(data['remarks'])
    if 'dispense_type' in data:
        update_fields.append("dispense_type = %s")
        params.append(data['dispense_type'])
    
    if not update_fields: return jsonify({"message": "ไม่มีข้อมูลให้อัปเดต"}), 200

    params.append(record_id)
    query = f"UPDATE dispense_records SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s"
    db_execute_query(query, tuple(params), commit=True)
    return jsonify({"message": "อัปเดตข้อมูลสำเร็จ"})


@dispense_bp.route('/dispense_records/<int:record_id>', methods=['DELETE'])
def delete_dispense_record(record_id):
    """ลบเอกสารตัดจ่าย (Hard Delete) และคืนสต็อก"""
    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        dispensed_items = db_execute_query("SELECT di.*, dr.hcode FROM dispense_items di JOIN dispense_records dr ON di.dispense_record_id = dr.id WHERE di.dispense_record_id = %s", (record_id,), fetchall=True, cursor_to_use=cursor)

        for item in dispensed_items:
            if item['item_status'] == 'ปกติ' or item['item_status'] == 'ถูกแทนที่โดย Excel':
                # คืนสต็อก
                inv_item = db_execute_query("SELECT id FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s",
                                            (item['hcode'], item['medicine_id'], item['lot_number'], item['expiry_date']), fetchone=True, cursor_to_use=cursor)
                if inv_item:
                    db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s", (item['quantity_dispensed'], inv_item['id']), commit=False, cursor_to_use=cursor)
                else: # หาก Lot เดิมไม่มีใน inventory ให้สร้างใหม่
                    db_execute_query("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, CURDATE())",
                                     (item['hcode'], item['medicine_id'], item['lot_number'], item['expiry_date'], item['quantity_dispensed']), commit=False, cursor_to_use=cursor)
                # ลบ Transaction Log เดิม
                db_execute_query("DELETE FROM inventory_transactions WHERE reference_document_id = (SELECT dispense_record_number FROM dispense_records WHERE id = %s) AND medicine_id = %s AND lot_number = %s AND quantity_change = %s",
                                 (record_id, item['medicine_id'], item['lot_number'], -item['quantity_dispensed']), commit=False, cursor_to_use=cursor)

        db_execute_query("DELETE FROM dispense_items WHERE dispense_record_id = %s", (record_id,), commit=False, cursor_to_use=cursor)
        db_execute_query("DELETE FROM dispense_records WHERE id = %s", (record_id,), commit=False, cursor_to_use=cursor)
        conn.commit()
        return jsonify({"message": f"ลบเอกสารตัดจ่าย ID {record_id} และคืนสต็อกเรียบร้อยแล้ว"})
    except Error as e:
        if conn: conn.rollback()
        logger.error(f"DB Error in delete_dispense_record: {e}", exc_info=True)
        return jsonify({"error": f"Database Error: {e}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@dispense_bp.route('/dispense/upload_excel/preview', methods=['POST'])
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
        logger.error(f"Error processing Excel preview: {str(e)}", exc_info=True)
        return jsonify({"error": f"เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: {str(e)}"}), 500
    finally:
        if 'conn' in locals() and conn and conn.is_connected():
            if 'cursor' in locals() and cursor:
                cursor.close()
            conn.close()


@dispense_bp.route('/dispense/process_excel_dispense', methods=['POST'])
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
        logger.error(f"Error sorting dispense items by date: {e}. Items: {items_to_process_original}")
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
                logger.warning(f"Invalid overall_dispense_date_iso from first sorted item: {temp_date_str}, using current date.")
        
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
                            # For Hard Delete, _cancel_dispense_item_internal now also deletes the dispense_item.
                            # We pass for_excel_update=True to correctly mark the old dispense_record if needed,
                            # though the item itself will be gone if successfully "cancelled" this way.
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
             # If all items failed or were skipped, and a dispense record was created,
             # it might be an empty record. Delete it to avoid confusion.
            if dispense_record_id and processed_count == 0 and not updated_hos_guids : # only delete if truly empty
                db_execute_query("DELETE FROM dispense_records WHERE id = %s", (dispense_record_id,), commit=False, cursor_to_use=cursor)
                logger.info(f"Deleted empty dispense record {dispense_record_id} as no items were processed.")
                dispense_record_id = None # Nullify so it's not returned
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
        logger.error(f"Database error during Excel dispense processing: {str(e_db)}", exc_info=True)
        return jsonify({"error": f"Database error: {str(e_db)}"}), 500
    except Exception as e_main:
        if conn: conn.rollback()
        logger.error(f"General error during Excel dispense processing: {str(e_main)}", exc_info=True)
        return jsonify({"error": f"General error: {str(e_main)}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

