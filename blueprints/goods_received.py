from flask import Blueprint, request, jsonify, current_app
from utils.db_helpers import db_execute_query, get_db_connection
from utils.date_helpers import thai_to_iso_date, iso_to_thai_date
from mysql.connector import Error
from datetime import datetime

from ..inventory import get_total_medicine_stock # Corrected relative import

gr_bp = Blueprint('gr_bp', __name__, url_prefix='/api')

@gr_bp.route('/goods_received', methods=['POST'])
def add_goods_received():
    data = request.get_json()
    if not data or not all(k in data for k in ['received_date', 'receiver_id', 'hcode', 'items']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (ต้องการ received_date, receiver_id, hcode, items)"}), 400
    receiver_id, hcode = data['receiver_id'], data['hcode']
    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        received_date_iso = thai_to_iso_date(data['received_date'])
        if not received_date_iso: conn.rollback(); return jsonify({"error": "รูปแบบวันที่รับยาไม่ถูกต้อง"}), 400
        voucher_number = data.get('voucher_number')
        if not voucher_number and not data.get('requisition_id'):
            current_date_str = datetime.now().strftime('%y%m%d')
            cursor.execute("SELECT voucher_number FROM goods_received_vouchers WHERE hcode = %s AND voucher_number LIKE %s ORDER BY id DESC LIMIT 1", (hcode, f"GRN-{hcode}-{current_date_str}-%",))
            last_voucher = cursor.fetchone()
            next_seq = 1
            if last_voucher:
                try: next_seq = int(last_voucher['voucher_number'].split('-')[-1]) + 1
                except (IndexError, ValueError): pass
            voucher_number = f"GRN-{hcode}-{current_date_str}-{next_seq:03d}"
        elif data.get('requisition_id') and not voucher_number:
            req_info = db_execute_query("SELECT requisition_number FROM requisitions WHERE id = %s", (data.get('requisition_id'),), fetchone=True, cursor_to_use=cursor)
            voucher_number = f"GRN-{req_info['requisition_number']}" if req_info else f"GRN-{hcode}-{datetime.now().strftime('%y%m%d%H%M%S')}"

        sql_voucher = "INSERT INTO goods_received_vouchers (hcode, voucher_number, requisition_id, received_date, receiver_id, supplier_name, invoice_number, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
        cursor.execute(sql_voucher, (hcode, voucher_number, data.get('requisition_id'), received_date_iso, receiver_id, data.get('supplier_name'), data.get('invoice_number'), data.get('remarks')))
        voucher_id = cursor.lastrowid

        if not data.get('items') or not isinstance(data['items'], list) or len(data['items']) == 0:
            conn.rollback(); return jsonify({"error": "ต้องมีรายการยาอย่างน้อย 1 รายการสำหรับการรับยา"}), 400

        for item in data['items']:
            if not all(k in item for k in ['medicine_id', 'lot_number', 'expiry_date', 'quantity_received']):
                conn.rollback(); return jsonify({"error": f"ข้อมูลรายการยาที่รับไม่ครบถ้วน: {item}"}), 400
            medicine_id, lot_number = item['medicine_id'], item['lot_number']
            expiry_date_iso = thai_to_iso_date(item['expiry_date'])
            if not expiry_date_iso: conn.rollback(); return jsonify({"error": f"รูปแบบวันหมดอายุของยาที่รับไม่ถูกต้อง: {item['expiry_date']}"}), 400
            quantity_received = int(item['quantity_received'])
            if quantity_received <= 0: conn.rollback(); return jsonify({"error": "จำนวนที่รับต้องมากกว่า 0"}), 400

            if not db_execute_query("SELECT id FROM medicines WHERE id = %s AND hcode = %s", (medicine_id, hcode), fetchone=True, cursor_to_use=cursor):
                conn.rollback(); return jsonify({"error": f"ไม่พบรหัสยา {medicine_id} สำหรับหน่วยบริการ {hcode}"}), 400

            cursor.execute("INSERT INTO goods_received_items (goods_received_voucher_id, medicine_id, lot_number, expiry_date, quantity_received, unit_price, notes) VALUES (%s, %s, %s, %s, %s, %s, %s)", (voucher_id, medicine_id, lot_number, expiry_date_iso, quantity_received, item.get('unit_price', 0.00), item.get('notes')))

            total_stock_before_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)

            inventory_item = db_execute_query("SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)
            if inventory_item:
                inventory_id = inventory_item['id']
                cursor.execute("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s", (quantity_received, inventory_id))
            else:
                cursor.execute("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, %s)", (hcode, medicine_id, lot_number, expiry_date_iso, quantity_received, received_date_iso))

            total_stock_after_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)

            transaction_type = 'รับเข้า-ใบเบิก' if data.get('requisition_id') else 'รับเข้า-ตรง'
            cursor.execute("INSERT INTO inventory_transactions (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks, transaction_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())", (hcode, medicine_id, lot_number, expiry_date_iso, transaction_type, quantity_received, total_stock_before_item_txn, total_stock_after_item_txn, voucher_number or f"RECV{voucher_id}", receiver_id, item.get('notes', "รับยาเข้าคลัง")))

        if data.get('requisition_id'):
            db_execute_query("UPDATE requisitions SET status = 'รับยาแล้ว', updated_at = NOW() WHERE id = %s AND (status = 'อนุมัติแล้ว' OR status = 'อนุมัติบางส่วน')", (data.get('requisition_id'),), commit=False, cursor_to_use=cursor)

        conn.commit()
        return jsonify({"message": "บันทึกการรับยาเข้าคลังสำเร็จ", "voucher_id": voucher_id, "voucher_number": voucher_number}), 201
    except Error as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error in add_goods_received: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        current_app.logger.error(f"General error in add_goods_received: {ex}", exc_info=True)
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@gr_bp.route('/goods_received_vouchers', methods=['GET'])
def get_goods_received_vouchers():
    user_hcode = request.args.get('hcode')
    voucher_type = request.args.get('type')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')

    query = """
        SELECT
            grv.id, grv.voucher_number, grv.received_date,
            u.full_name as receiver_name,
            grv.supplier_name,
            (SELECT COUNT(*) FROM goods_received_items gri WHERE gri.goods_received_voucher_id = grv.id) as item_count,
            grv.requisition_id,
            grv.hcode,
            grv.remarks
        FROM goods_received_vouchers grv
        JOIN users u ON grv.receiver_id = u.id
    """
    conditions = []
    params = []

    if user_hcode:
        conditions.append("grv.hcode = %s")
        params.append(user_hcode)

    if voucher_type == 'manual':
        conditions.append("grv.requisition_id IS NULL")
    elif voucher_type == 'requisition':
        conditions.append("grv.requisition_id IS NOT NULL")

    if start_date_thai:
        start_date_iso = thai_to_iso_date(start_date_thai)
        if start_date_iso:
            conditions.append("grv.received_date >= %s")
            params.append(start_date_iso)
    if end_date_thai:
        end_date_iso = thai_to_iso_date(end_date_thai)
        if end_date_iso:
            conditions.append("grv.received_date <= %s")
            params.append(end_date_iso)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY grv.received_date DESC, grv.id DESC"

    vouchers = db_execute_query(query, tuple(params) if params else None, fetchall=True)

    if vouchers is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลการรับยาได้"}), 500

    for voucher in vouchers:
        voucher['received_date'] = iso_to_thai_date(voucher['received_date'])
    return jsonify(vouchers)

@gr_bp.route('/goods_received_vouchers/<int:voucher_id>', methods=['GET'])
def get_single_goods_received_voucher(voucher_id):
    user_hcode_context = request.args.get('hcode_context')
    query = "SELECT grv.id, grv.voucher_number, grv.received_date, grv.receiver_id, u.full_name as receiver_name, grv.supplier_name, grv.invoice_number, grv.remarks, grv.hcode, grv.requisition_id FROM goods_received_vouchers grv JOIN users u ON grv.receiver_id = u.id WHERE grv.id = %s"
    voucher = db_execute_query(query, (voucher_id,), fetchone=True)
    if not voucher: return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
    voucher['received_date_thai'] = iso_to_thai_date(voucher['received_date'])
    return jsonify(voucher)

@gr_bp.route('/goods_received_vouchers/<int:voucher_id>/items', methods=['GET'])
def get_goods_received_voucher_items(voucher_id):
    query = "SELECT gri.id as goods_received_item_id, m.id as medicine_id, m.medicine_code, m.generic_name, m.strength, m.unit, gri.lot_number, gri.expiry_date, gri.quantity_received, gri.unit_price, gri.notes FROM goods_received_items gri JOIN medicines m ON gri.medicine_id = m.id WHERE gri.goods_received_voucher_id = %s ORDER BY m.generic_name;"
    items = db_execute_query(query, (voucher_id,), fetchall=True)
    if items is None: return jsonify({"error": "ไม่สามารถดึงรายการยาของเอกสารรับนี้ได้"}), 500
    for item in items:
        item['expiry_date_original_iso'] = str(item['expiry_date'])
        item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
    return jsonify(items)

@gr_bp.route('/goods_received_vouchers/<int:voucher_id>', methods=['PUT'])
def update_manual_goods_received_voucher(voucher_id):
    data = request.get_json()
    user_hcode_context = data.get('hcode_context')

    if not data: return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400
    voucher = db_execute_query("SELECT id, hcode, requisition_id, voucher_number, received_date, supplier_name, invoice_number, remarks FROM goods_received_vouchers WHERE id = %s", (voucher_id,), fetchone=True)
    if not voucher: return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
    if voucher['requisition_id'] is not None: return jsonify({"error": "ไม่สามารถแก้ไขเอกสารรับยาที่อ้างอิงใบเบิกผ่านหน้านี้ได้"}), 403
    if user_hcode_context and voucher['hcode'] != user_hcode_context: return jsonify({"error": "คุณไม่มีสิทธิ์แก้ไขเอกสารนี้"}), 403

    received_date_iso = thai_to_iso_date(data.get('received_date'))
    if data.get('received_date') and not received_date_iso:
        return jsonify({"error": "รูปแบบวันที่รับยาไม่ถูกต้อง"}), 400

    query = "UPDATE goods_received_vouchers SET received_date = %s, supplier_name = %s, invoice_number = %s, remarks = %s WHERE id = %s AND requisition_id IS NULL"
    params = (received_date_iso or voucher['received_date'], data.get('supplier_name', voucher['supplier_name']), data.get('invoice_number', voucher['invoice_number']), data.get('remarks', voucher['remarks']), voucher_id)
    db_execute_query(query, params, commit=True)
    return jsonify({"message": f"อัปเดตข้อมูลเอกสารรับยา (กรอกเอง) เลขที่ {voucher['voucher_number'] or voucher_id} สำเร็จ"})

@gr_bp.route('/goods_received_vouchers/<int:voucher_id>', methods=['DELETE'])
def delete_manual_goods_received_voucher(voucher_id):
    user_hcode_context = request.args.get('hcode_context')
    user_id_context = request.args.get('user_id_context', type=int)

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        voucher = db_execute_query("SELECT id, hcode, requisition_id, voucher_number, supplier_name FROM goods_received_vouchers WHERE id = %s", (voucher_id,), fetchone=True, cursor_to_use=cursor)
        if not voucher:
            conn.rollback()
            return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404

        if voucher['requisition_id'] is not None:
            conn.rollback()
            return jsonify({"error": "ไม่สามารถลบเอกสารรับยาที่อ้างอิงใบเบิกผ่านหน้านี้ได้"}), 403

        if user_hcode_context and voucher['hcode'] != user_hcode_context:
             conn.rollback()
             return jsonify({"error": "คุณไม่มีสิทธิ์ลบเอกสารนี้"}), 403
        if not user_id_context:
            conn.rollback()
            return jsonify({"error": "ไม่สามารถระบุผู้ดำเนินการลบได้"}), 400

        received_items = db_execute_query("SELECT id as goods_received_item_id, medicine_id, lot_number, expiry_date, quantity_received FROM goods_received_items WHERE goods_received_voucher_id = %s", (voucher_id,), fetchall=True, cursor_to_use=cursor)

        if received_items is None:
            conn.rollback()
            return jsonify({"error": "ไม่พบรายการยาในเอกสารรับนี้"}), 500

        for item in received_items:
            medicine_id = item['medicine_id']
            lot_number = item['lot_number']
            expiry_date_iso = str(item['expiry_date'])
            quantity_to_reverse = item['quantity_received']

            inv_item = db_execute_query("SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (voucher['hcode'], medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)

            if inv_item:
                db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand - %s WHERE id = %s",
                                 (quantity_to_reverse, inv_item['id']), commit=False, cursor_to_use=cursor)

                delete_txn_conditions = [
                    "hcode = %s", "medicine_id = %s", "lot_number = %s", "expiry_date = %s",
                    "reference_document_id = %s", "quantity_change = %s",
                    "transaction_type = %s"
                ]
                delete_txn_params = [
                    voucher['hcode'], medicine_id, lot_number, expiry_date_iso,
                    voucher['voucher_number'] or f"RECV{voucher_id}",
                    quantity_to_reverse,
                    'รับเข้า-ตรง'
                ]
                delete_original_txn_query = f"DELETE FROM inventory_transactions WHERE {' AND '.join(delete_txn_conditions)}"
                current_app.logger.debug(f"Attempting to delete original goods_received inventory_transaction with query: {delete_original_txn_query} and params: {tuple(delete_txn_params)}")
                cursor.execute(delete_original_txn_query, tuple(delete_txn_params))
                if cursor.rowcount == 0:
                    current_app.logger.warning(f"No original inventory_transaction found to delete for goods_received_item (MedID: {medicine_id}, Lot: {lot_number}) of voucher {voucher_id}. Stock was still adjusted (or attempted).")
                else:
                    current_app.logger.info(f"Deleted {cursor.rowcount} original inventory_transaction(s) for goods_received_item (MedID: {medicine_id}, Lot: {lot_number}) of voucher {voucher_id}.")

            else:
                current_app.logger.warning(f"Inventory record not found for hcode {voucher['hcode']}, med_id {medicine_id}, lot {lot_number}, exp {expiry_date_iso} during GRN delete. Stock not adjusted for this specific non-existent inventory lot.")

        db_execute_query("DELETE FROM goods_received_items WHERE goods_received_voucher_id = %s", (voucher_id,), commit=False, cursor_to_use=cursor)
        db_execute_query("DELETE FROM goods_received_vouchers WHERE id = %s", (voucher_id,), commit=False, cursor_to_use=cursor)

        conn.commit()
        return jsonify({"message": f"ลบเอกสารรับยา (กรอกเอง) ID {voucher_id} และข้อมูลที่เกี่ยวข้องทั้งหมดออกจากระบบแล้ว (Hard Delete)"})
    except Error as e:
        if conn: conn.rollback()
        current_app.logger.error(f"Database error during manual GRN hard delete: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        current_app.logger.error(f"General error during manual GRN hard delete: {ex}", exc_info=True)
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
