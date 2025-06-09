# /blueprints/receive.py

from flask import Blueprint, request, jsonify
from helpers.database import db_execute_query, get_db_connection
from helpers.utils import thai_to_iso_date, iso_to_thai_date
from datetime import datetime
from mysql.connector import Error
import logging

# ตั้งค่า logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# สร้าง Blueprint สำหรับ goods_received
receive_bp = Blueprint('receive', __name__, url_prefix='/api')

def get_total_medicine_stock(hcode, medicine_id, cursor):
    """ดึงยอดคงเหลือรวมของยาที่ระบุจาก inventory"""
    stock_query = "SELECT COALESCE(SUM(quantity_on_hand), 0) as total_stock FROM inventory WHERE hcode = %s AND medicine_id = %s"
    stock_data = db_execute_query(stock_query, (hcode, medicine_id), fetchone=True, cursor_to_use=cursor)
    return stock_data['total_stock'] if stock_data else 0

@receive_bp.route('/goods_received', methods=['POST'])
def add_goods_received():
    """
    บันทึกการรับยาเข้าคลัง
    สามารถรับจากการเบิก (มี requisition_id) หรือรับตรง (ไม่มี requisition_id)
    """
    data = request.get_json()
    if not data or not all(k in data for k in ['received_date', 'receiver_id', 'hcode', 'items']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (ต้องการ received_date, receiver_id, hcode, items)"}), 400

    receiver_id, hcode = data['receiver_id'], data['hcode']
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        received_date_iso = thai_to_iso_date(data['received_date'])
        if not received_date_iso:
            conn.rollback()
            return jsonify({"error": "รูปแบบวันที่รับยาไม่ถูกต้อง"}), 400

        voucher_number = data.get('voucher_number')
        requisition_id = data.get('requisition_id')

        # สร้างเลขที่เอกสารอัตโนมัติหากไม่ได้รับมา
        if not voucher_number:
            if requisition_id:
                req_info = db_execute_query("SELECT requisition_number FROM requisitions WHERE id = %s", (requisition_id,), fetchone=True, cursor_to_use=cursor)
                voucher_number = f"GRN-{req_info['requisition_number']}" if req_info else f"GRN-{hcode}-{datetime.now().strftime('%y%m%d%H%M%S')}"
            else:
                current_date_str = datetime.now().strftime('%y%m%d')
                cursor.execute("SELECT voucher_number FROM goods_received_vouchers WHERE hcode = %s AND voucher_number LIKE %s ORDER BY id DESC LIMIT 1", (hcode, f"GRN-{hcode}-{current_date_str}-%",))
                last_voucher = cursor.fetchone()
                next_seq = 1
                if last_voucher:
                    try:
                        next_seq = int(last_voucher['voucher_number'].split('-')[-1]) + 1
                    except (IndexError, ValueError):
                        pass
                voucher_number = f"GRN-{hcode}-{current_date_str}-{next_seq:03d}"

        # เพิ่มข้อมูลลงใน goods_received_vouchers
        sql_voucher = "INSERT INTO goods_received_vouchers (hcode, voucher_number, requisition_id, received_date, receiver_id, supplier_name, invoice_number, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"
        cursor.execute(sql_voucher, (hcode, voucher_number, requisition_id, received_date_iso, receiver_id, data.get('supplier_name'), data.get('invoice_number'), data.get('remarks')))
        voucher_id = cursor.lastrowid

        if not data.get('items') or not isinstance(data['items'], list) or len(data['items']) == 0:
            conn.rollback()
            return jsonify({"error": "ต้องมีรายการยาอย่างน้อย 1 รายการสำหรับการรับยา"}), 400

        # วนลูปเพื่อจัดการแต่ละรายการยา
        for item in data['items']:
            if not all(k in item for k in ['medicine_id', 'lot_number', 'expiry_date', 'quantity_received']):
                conn.rollback()
                return jsonify({"error": f"ข้อมูลรายการยาที่รับไม่ครบถ้วน: {item}"}), 400

            medicine_id, lot_number = item['medicine_id'], item['lot_number']
            expiry_date_iso = thai_to_iso_date(item['expiry_date'])
            if not expiry_date_iso:
                conn.rollback()
                return jsonify({"error": f"รูปแบบวันหมดอายุของยาที่รับไม่ถูกต้อง: {item['expiry_date']}"}), 400

            quantity_received = int(item['quantity_received'])
            if quantity_received <= 0:
                conn.rollback()
                return jsonify({"error": "จำนวนที่รับต้องมากกว่า 0"}), 400

            # ตรวจสอบว่ายาที่รับมีอยู่ใน master data ของหน่วยบริการนั้นหรือไม่
            if not db_execute_query("SELECT id FROM medicines WHERE id = %s AND hcode = %s", (medicine_id, hcode), fetchone=True, cursor_to_use=cursor):
                conn.rollback()
                return jsonify({"error": f"ไม่พบรหัสยา {medicine_id} สำหรับหน่วยบริการ {hcode}"}), 400

            # เพิ่มรายการยาที่รับ
            cursor.execute("INSERT INTO goods_received_items (goods_received_voucher_id, medicine_id, lot_number, expiry_date, quantity_received, unit_price, notes) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                           (voucher_id, medicine_id, lot_number, expiry_date_iso, quantity_received, item.get('unit_price', 0.00), item.get('notes')))

            # อัปเดตคลัง (Inventory) และสร้าง Transaction Log
            total_stock_before = get_total_medicine_stock(hcode, medicine_id, cursor)

            inv_item = db_execute_query("SELECT id FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)
            if inv_item:
                cursor.execute("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s", (quantity_received, inv_item['id']))
            else:
                cursor.execute("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, %s)", (hcode, medicine_id, lot_number, expiry_date_iso, quantity_received, received_date_iso))

            total_stock_after = get_total_medicine_stock(hcode, medicine_id, cursor)
            
            transaction_type = 'รับเข้า-ใบเบิก' if requisition_id else 'รับเข้า-ตรง'            
            transaction_datetime_for_db = f"{received_date_iso} {datetime.now().strftime('%H:%M:%S')}"
            
            # เปลี่ยนการใช้ NOW() มาเป็นตัวแปรที่เราสร้างขึ้น
            sql_transaction = """
                INSERT INTO inventory_transactions 
                (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, 
                quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks, transaction_date) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            params_transaction = (
                hcode, medicine_id, lot_number, expiry_date_iso, transaction_type, quantity_received, 
                total_stock_before, total_stock_after, voucher_number or f"RECV{voucher_id}", receiver_id, 
                item.get('notes', "รับยาเข้าคลัง"), transaction_datetime_for_db
            )
            cursor.execute(sql_transaction, params_transaction)
        # อัปเดตสถานะใบเบิกหากเป็นการรับจากใบเบิก
        if requisition_id:
            db_execute_query("UPDATE requisitions SET status = 'รับยาแล้ว', updated_at = NOW() WHERE id = %s AND (status = 'อนุมัติแล้ว' OR status = 'อนุมัติบางส่วน')", (requisition_id,), commit=False, cursor_to_use=cursor)

        conn.commit()
        return jsonify({"message": "บันทึกการรับยาเข้าคลังสำเร็จ", "voucher_id": voucher_id, "voucher_number": voucher_number}), 201

    except Error as e:
        if conn: conn.rollback()
        logger.error(f"Database error in add_goods_received: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        logger.error(f"General error in add_goods_received: {ex}", exc_info=True)
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@receive_bp.route('/goods_received_vouchers', methods=['GET'])
def get_goods_received_vouchers():
    """
    ดึงรายการเอกสารรับยาทั้งหมด
    Query Params: hcode, type (manual/requisition), startDate, endDate
    """
    user_hcode = request.args.get('hcode')
    voucher_type = request.args.get('type')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')

    query = """
        SELECT
            grv.id, grv.voucher_number, grv.received_date,
            u.full_name as receiver_name, grv.supplier_name,
            (SELECT COUNT(*) FROM goods_received_items gri WHERE gri.goods_received_voucher_id = grv.id) as item_count,
            grv.requisition_id, grv.hcode, grv.remarks
        FROM goods_received_vouchers grv
        JOIN users u ON grv.receiver_id = u.id
    """
    conditions, params = [], []

    if user_hcode:
        conditions.append("grv.hcode = %s")
        params.append(user_hcode)

    if voucher_type == 'manual':
        conditions.append("grv.requisition_id IS NULL")
    elif voucher_type == 'requisition':
        conditions.append("grv.requisition_id IS NOT NULL")

    if start_date_thai and (start_date_iso := thai_to_iso_date(start_date_thai)):
        conditions.append("grv.received_date >= %s")
        params.append(start_date_iso)
    if end_date_thai and (end_date_iso := thai_to_iso_date(end_date_thai)):
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


@receive_bp.route('/goods_received_vouchers/<int:voucher_id>', methods=['GET'])
def get_single_goods_received_voucher(voucher_id):
    """
    ดึงข้อมูลเอกสารรับยาเฉพาะใบที่ระบุ
    """
    query = "SELECT grv.*, u.full_name as receiver_name FROM goods_received_vouchers grv JOIN users u ON grv.receiver_id = u.id WHERE grv.id = %s"
    voucher = db_execute_query(query, (voucher_id,), fetchone=True)
    if not voucher:
        return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
    voucher['received_date_thai'] = iso_to_thai_date(voucher['received_date'])
    return jsonify(voucher)


@receive_bp.route('/goods_received_vouchers/<int:voucher_id>/items', methods=['GET'])
def get_goods_received_voucher_items(voucher_id):
    """
    ดึงรายการยาทั้งหมดในเอกสารรับยาที่ระบุ
    """
    query = """
        SELECT gri.id as goods_received_item_id, m.id as medicine_id, m.medicine_code,
               m.generic_name, m.strength, m.unit, gri.lot_number, gri.expiry_date,
               gri.quantity_received, gri.unit_price, gri.notes
        FROM goods_received_items gri
        JOIN medicines m ON gri.medicine_id = m.id
        WHERE gri.goods_received_voucher_id = %s ORDER BY m.generic_name;
    """
    items = db_execute_query(query, (voucher_id,), fetchall=True)
    if items is None:
        return jsonify({"error": "ไม่สามารถดึงรายการยาของเอกสารรับนี้ได้"}), 500
    for item in items:
        item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
    return jsonify(items)


@receive_bp.route('/goods_received_vouchers/<int:voucher_id>', methods=['PUT'])
def update_manual_goods_received_voucher(voucher_id):
    """
    อัปเดตข้อมูลหัวเอกสารรับยา (เฉพาะที่รับตรง)
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400

    voucher = db_execute_query("SELECT id, requisition_id, voucher_number FROM goods_received_vouchers WHERE id = %s", (voucher_id,), fetchone=True)
    if not voucher:
        return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
    if voucher['requisition_id'] is not None:
        return jsonify({"error": "ไม่สามารถแก้ไขเอกสารรับยาที่อ้างอิงใบเบิกผ่านหน้านี้ได้"}), 403

    received_date_iso = thai_to_iso_date(data.get('received_date'))
    if data.get('received_date') and not received_date_iso:
        return jsonify({"error": "รูปแบบวันที่รับยาไม่ถูกต้อง"}), 400

    query = "UPDATE goods_received_vouchers SET received_date = %s, supplier_name = %s, invoice_number = %s, remarks = %s WHERE id = %s"
    params = (received_date_iso or voucher['received_date'], data.get('supplier_name'), data.get('invoice_number'), data.get('remarks'), voucher_id)
    db_execute_query(query, params, commit=True)
    return jsonify({"message": f"อัปเดตข้อมูลเอกสารรับยา (กรอกเอง) เลขที่ {voucher['voucher_number'] or voucher_id} สำเร็จ"})


@receive_bp.route('/goods_received_vouchers/<int:voucher_id>', methods=['DELETE'])
def delete_manual_goods_received_voucher(voucher_id):
    """
    ลบเอกสารรับยา (Hard Delete) และทำการคืนสต็อก
    """
    user_hcode_context = request.args.get('hcode_context')

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        voucher = db_execute_query("SELECT * FROM goods_received_vouchers WHERE id = %s", (voucher_id,), fetchone=True, cursor_to_use=cursor)
        if not voucher:
            conn.rollback()
            return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
        if voucher['requisition_id'] is not None:
            conn.rollback()
            return jsonify({"error": "ไม่สามารถลบเอกสารรับยาที่อ้างอิงใบเบิกผ่านหน้านี้ได้"}), 403
        if user_hcode_context and voucher['hcode'] != user_hcode_context:
            conn.rollback()
            return jsonify({"error": "คุณไม่มีสิทธิ์ลบเอกสารนี้"}), 403

        received_items = db_execute_query("SELECT * FROM goods_received_items WHERE goods_received_voucher_id = %s", (voucher_id,), fetchall=True, cursor_to_use=cursor)

        # คืนสต็อก
        for item in received_items:
            # ลดยอดใน inventory
            db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand - %s WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s",
                             (item['quantity_received'], voucher['hcode'], item['medicine_id'], item['lot_number'], item['expiry_date']), commit=False, cursor_to_use=cursor)
            # ลบ transaction log เดิม
            db_execute_query("DELETE FROM inventory_transactions WHERE reference_document_id = %s AND medicine_id = %s AND lot_number = %s AND quantity_change > 0",
                             (voucher['voucher_number'], item['medicine_id'], item['lot_number']), commit=False, cursor_to_use=cursor)

        # ลบข้อมูล
        db_execute_query("DELETE FROM goods_received_items WHERE goods_received_voucher_id = %s", (voucher_id,), commit=False, cursor_to_use=cursor)
        db_execute_query("DELETE FROM goods_received_vouchers WHERE id = %s", (voucher_id,), commit=False, cursor_to_use=cursor)
        conn.commit()
        return jsonify({"message": f"ลบเอกสารรับยา (กรอกเอง) ID {voucher_id} และคืนสต็อกเรียบร้อยแล้ว"})
    except Error as e:
        if conn: conn.rollback()
        logger.error(f"DB error in delete_manual_goods_received_voucher: {e}", exc_info=True)
        return jsonify({"error": f"Database error: {e}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
