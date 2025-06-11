# /blueprints/requisitions.py

from flask import Blueprint, request, jsonify
from helpers.database import db_execute_query, get_db_connection
from helpers.utils import thai_to_iso_date, iso_to_thai_date
from datetime import datetime
from mysql.connector import Error
import math # Added for math.ceil

# สร้าง Blueprint สำหรับ requisitions
requisition_bp = Blueprint('requisitions', __name__, url_prefix='/api/requisitions')


@requisition_bp.route('/', methods=['GET'])
def get_requisitions():
    """
    ดึงข้อมูลใบเบิกทั้งหมดตามเงื่อนไข
    Query Params: startDate, endDate, hcode, role
    """
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')
    user_hcode = request.args.get('hcode')
    user_role = request.args.get('role')

    query = """
        SELECT
            r.id, r.requisition_number, r.requisition_date,
            u_requester.full_name as requester_name,
            us.name as requester_hospital_name,
            r.requester_hcode, r.status, r.approval_date,
            u_approver.full_name as approved_by_name
        FROM requisitions r
        JOIN users u_requester ON r.requester_id = u_requester.id
        LEFT JOIN unitservice us ON r.requester_hcode = us.hcode
        LEFT JOIN users u_approver ON r.approved_by_id = u_approver.id
    """
    params = []
    conditions = []

    if user_role == 'เจ้าหน้าที่ รพสต.' and user_hcode:
        conditions.append("r.requester_hcode = %s")
        params.append(user_hcode)
    elif user_role == 'ผู้ดูแลระบบ' and user_hcode:
        conditions.append("r.requester_hcode = %s")
        params.append(user_hcode)

    if start_date_thai:
        start_date_iso = thai_to_iso_date(start_date_thai)
        if start_date_iso:
            conditions.append("r.requisition_date >= %s")
            params.append(start_date_iso)
    if end_date_thai:
        end_date_iso = thai_to_iso_date(end_date_thai)
        if end_date_iso:
            conditions.append("r.requisition_date <= %s")
            params.append(end_date_iso)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY r.requisition_date DESC, r.id DESC"

    requisitions_data = db_execute_query(query, tuple(params) if params else None, fetchall=True)

    if requisitions_data is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลใบเบิกได้"}), 500

    for req_item in requisitions_data:
        req_item['requisition_date'] = iso_to_thai_date(req_item.get('requisition_date'))
        req_item['approval_date'] = iso_to_thai_date(req_item.get('approval_date'))
    return jsonify(requisitions_data)


@requisition_bp.route('/', methods=['POST'])
def create_requisition():
    """
    สร้างใบเบิกยาใหม่
    """
    data = request.get_json()
    if not data or not all(k in data for k in ['requisition_date', 'requester_id', 'requester_hcode', 'items']) or not data.get('items'):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (ต้องการ requisition_date, requester_id, requester_hcode, items และ items ต้องไม่ว่าง)"}), 400

    requester_id = data['requester_id']
    requester_hcode = data['requester_hcode']
    requisition_date_iso = thai_to_iso_date(data['requisition_date'])

    if not requisition_date_iso:
        return jsonify({"error": "รูปแบบวันที่เบิกไม่ถูกต้อง"}), 400
    if not requester_hcode:
        return jsonify({"error": "ไม่พบรหัสหน่วยบริการของผู้ขอเบิก"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        current_date_str = datetime.now().strftime('%Y%m%d')
        cursor.execute("SELECT requisition_number FROM requisitions WHERE requisition_number LIKE %s ORDER BY id DESC LIMIT 1", (f"REQ-{current_date_str}-%",))
        last_req = cursor.fetchone()
        next_seq = 1
        if last_req:
            try:
                next_seq = int(last_req['requisition_number'].split('-')[-1]) + 1
            except (IndexError, ValueError):
                pass

        requisition_number = f"REQ-{current_date_str}-{next_seq:04d}"

        sql_requisition = "INSERT INTO requisitions (requisition_number, requisition_date, requester_id, requester_hcode, status, remarks) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(sql_requisition, (requisition_number, requisition_date_iso, requester_id, requester_hcode, 'รออนุมัติ', data.get('remarks', '')))
        requisition_id = cursor.lastrowid

        sql_requisition_item = "INSERT INTO requisition_items (requisition_id, medicine_id, quantity_requested) VALUES (%s, %s, %s)"
        for item in data['items']:
            if not item.get('medicine_id') or not item.get('quantity_requested'):
                conn.rollback()
                return jsonify({"error": "ข้อมูลรายการยาในใบเบิกไม่ครบถ้วน"}), 400

            med_check = db_execute_query("SELECT id FROM medicines WHERE id = %s AND hcode = %s", (item['medicine_id'], requester_hcode), fetchone=True, cursor_to_use=cursor)
            if not med_check:
                conn.rollback()
                return jsonify({"error": f"ไม่พบรหัสยา {item['medicine_id']} สำหรับหน่วยบริการ {requester_hcode} ของผู้ขอเบิก"}), 400

            cursor.execute(sql_requisition_item, (requisition_id, item['medicine_id'], item['quantity_requested']))

        conn.commit()
        return jsonify({"message": "สร้างใบเบิกยาสำเร็จ", "requisition_id": requisition_id, "requisition_number": requisition_number}), 201
    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@requisition_bp.route('/<int:requisition_id>', methods=['GET'])
def get_single_requisition(requisition_id):
    """
    ดึงข้อมูลใบเบิกเฉพาะใบที่ระบุ
    """
    query = """
        SELECT
            r.id, r.requisition_number, r.requisition_date,
            r.requester_id, u_requester.full_name as requester_name,
            r.requester_hcode, us.name as requester_hospital_name,
            r.status, r.remarks,
            r.approved_by_id, u_approver.full_name as approved_by_name,
            r.approver_hcode, r.approval_date
        FROM requisitions r
        JOIN users u_requester ON r.requester_id = u_requester.id
        LEFT JOIN unitservice us ON r.requester_hcode = us.hcode
        LEFT JOIN users u_approver ON r.approved_by_id = u_approver.id
        WHERE r.id = %s
    """
    requisition_data = db_execute_query(query, (requisition_id,), fetchone=True)

    if not requisition_data:
        return jsonify({"error": "ไม่พบใบเบิก"}), 404

    requisition_data['requisition_date_thai'] = iso_to_thai_date(requisition_data.get('requisition_date'))
    requisition_data['approval_date_thai'] = iso_to_thai_date(requisition_data.get('approval_date'))

    return jsonify(requisition_data)


@requisition_bp.route('/pending_approval', methods=['GET'])
def get_pending_approval_requisitions():
    """
    ดึงข้อมูลใบเบิกที่รอการอนุมัติทั้งหมด
    """
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')

    query = """
        SELECT
            r.id, r.requisition_number, r.requisition_date,
            u.full_name as requester_name,
            us.name as requester_hospital_name,
            r.requester_hcode,
            (SELECT COUNT(*) FROM requisition_items ri WHERE ri.requisition_id = r.id) as item_count,
            r.status
        FROM requisitions r
        JOIN users u ON r.requester_id = u.id
        LEFT JOIN unitservice us ON r.requester_hcode = us.hcode
        WHERE r.status = 'รออนุมัติ'
    """
    params = []
    conditions_sql = []

    if start_date_thai:
        start_date_iso = thai_to_iso_date(start_date_thai)
        if start_date_iso:
            conditions_sql.append("r.requisition_date >= %s")
            params.append(start_date_iso)
    if end_date_thai:
        end_date_iso = thai_to_iso_date(end_date_thai)
        if end_date_iso:
            conditions_sql.append("r.requisition_date <= %s")
            params.append(end_date_iso)

    if conditions_sql:
        query += " AND " + " AND ".join(conditions_sql)

    query += " ORDER BY r.requisition_date ASC, r.id ASC"

    pending_requisitions = db_execute_query(query, tuple(params) if params else None, fetchall=True)

    if pending_requisitions is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลใบเบิกรออนุมัติได้"}), 500

    for req in pending_requisitions:
        req['requisition_date'] = iso_to_thai_date(req['requisition_date'])
    return jsonify(pending_requisitions)


@requisition_bp.route('/<int:requisition_id>/items', methods=['GET'])
def get_requisition_items(requisition_id):
    """
    ดึงรายการยาทั้งหมดในใบเบิกที่ระบุ
    """
    req_header = db_execute_query("SELECT requester_hcode FROM requisitions WHERE id = %s", (requisition_id,), fetchone=True)
    if not req_header:
        return jsonify({"error": "ไม่พบใบเบิก"}), 404

    requester_hcode_for_meds = req_header['requester_hcode']

    query = """
        SELECT
            ri.id as requisition_item_id, 
            m.id as medicine_id, 
            m.medicine_code,
            m.generic_name, 
            m.strength, 
            m.unit, 
            m.min_stock,
            m.max_stock,
            COALESCE(inv_sum.current_stock, 0) AS total_quantity_on_hand,
            ri.quantity_requested,
            ri.quantity_approved, 
            ri.approved_lot_number, 
            ri.approved_expiry_date,
            ri.item_approval_status, 
            ri.reason_for_change_or_rejection
        FROM requisition_items ri
        JOIN medicines m ON ri.medicine_id = m.id
        LEFT JOIN (
            SELECT 
                inv.medicine_id, 
                inv.hcode, 
                SUM(inv.quantity_on_hand) AS current_stock
            FROM inventory inv
            GROUP BY inv.medicine_id, inv.hcode
        ) AS inv_sum ON m.id = inv_sum.medicine_id AND m.hcode = inv_sum.hcode
        WHERE ri.requisition_id = %s AND m.hcode = %s
        ORDER BY m.generic_name;
    """
    items = db_execute_query(query, (requisition_id, requester_hcode_for_meds), fetchall=True)

    if items is None:
        return jsonify({"error": "ไม่สามารถดึงรายการยาในใบเบิกได้"}), 500

    for item in items:
        item['approved_expiry_date'] = iso_to_thai_date(item.get('approved_expiry_date'))

    return jsonify(items)


@requisition_bp.route('/<int:requisition_id>/cancel', methods=['PUT'])
def cancel_requisition_endpoint(requisition_id):
    """
    ยกเลิกใบเบิก (Hard Delete)
    """
    data = request.get_json()
    cancelling_user_id = data.get('user_id') if data else request.args.get('user_id', type=int)

    if not cancelling_user_id:
        return jsonify({"error": "ไม่สามารถระบุผู้ดำเนินการยกเลิกได้"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        requisition = db_execute_query("SELECT id, status FROM requisitions WHERE id = %s", (requisition_id,), fetchone=True, cursor_to_use=cursor)
        if not requisition:
            conn.rollback()
            return jsonify({"error": "ไม่พบใบเบิกที่ต้องการยกเลิก"}), 404

        if requisition['status'] != 'รออนุมัติ':
            conn.rollback()
            return jsonify({"error": f"ไม่สามารถยกเลิกใบเบิกได้ เนื่องจากสถานะปัจจุบันคือ '{requisition['status']}'"}), 400

        db_execute_query("DELETE FROM requisition_items WHERE requisition_id = %s", (requisition_id,), commit=False, cursor_to_use=cursor)
        db_execute_query("DELETE FROM requisitions WHERE id = %s", (requisition_id,), commit=False, cursor_to_use=cursor)
        conn.commit()
        return jsonify({"message": f"ใบเบิกเลขที่ ID {requisition_id} และรายการยาที่เกี่ยวข้อง ถูกลบออกจากระบบแล้ว (Hard Delete)"}), 200

    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"เกิดข้อผิดพลาดในการลบใบเบิก: {e}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@requisition_bp.route('/<int:requisition_id>/process_approval', methods=['PUT'])
def process_requisition_approval(requisition_id):
    """
    ดำเนินการอนุมัติ/ปฏิเสธ/แก้ไขจำนวนในใบเบิก
    """
    data = request.get_json()
    if not data or not all(k in data for k in ['approved_by_id', 'items']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (ต้องการ approved_by_id, items)"}), 400

    approved_by_id = data['approved_by_id']
    approver_hcode = data.get('approver_hcode')
    approval_items_data = data['items']

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        requisition_header = db_execute_query("SELECT status FROM requisitions WHERE id = %s", (requisition_id,), fetchone=True, cursor_to_use=cursor)
        if not requisition_header:
            conn.rollback()
            return jsonify({"error": "ไม่พบใบเบิก"}), 404
        if requisition_header['status'] != 'รออนุมัติ':
            conn.rollback()
            return jsonify({"error": f"ใบเบิกนี้ไม่อยู่ในสถานะ 'รออนุมัติ' (สถานะปัจจุบัน: {requisition_header['status']})"}), 400

        all_items_approved_as_requested = True
        any_item_approved = False
        all_items_rejected = True

        for item_data in approval_items_data:
            req_item_id = item_data.get('requisition_item_id')
            qty_approved = item_data.get('quantity_approved')
            item_status = item_data.get('item_approval_status')

            if req_item_id is None or qty_approved is None or item_status is None:
                conn.rollback()
                return jsonify({"error": f"ข้อมูลรายการยาไม่ครบถ้วน: {item_data}"}), 400

            original_req_item = db_execute_query("SELECT quantity_requested FROM requisition_items WHERE id = %s", (req_item_id,), fetchone=True, cursor_to_use=cursor)
            if not original_req_item:
                conn.rollback()
                return jsonify({"error": f"ไม่พบรายการยา ID {req_item_id} ในใบเบิกนี้"}), 404

            if item_status in ['อนุมัติ', 'แก้ไขจำนวน']:
                any_item_approved = True
                all_items_rejected = False
                if int(qty_approved) != original_req_item['quantity_requested']:
                    all_items_approved_as_requested = False
            elif item_status == 'ปฏิเสธ':
                all_items_approved_as_requested = False
            else:
                conn.rollback()
                return jsonify({"error": f"สถานะการอนุมัติรายการยาไม่ถูกต้อง: {item_status}"}), 400

            sql_update_item = "UPDATE requisition_items SET quantity_approved = %s, approved_lot_number = %s, approved_expiry_date = %s, item_approval_status = %s, reason_for_change_or_rejection = %s WHERE id = %s"
            approved_exp_date_iso = thai_to_iso_date(item_data.get('approved_expiry_date'))
            cursor.execute(sql_update_item, (int(qty_approved), item_data.get('approved_lot_number'), approved_exp_date_iso, item_status, item_data.get('reason_for_change_or_rejection'), req_item_id))

        final_status = 'ปฏิเสธ'
        if any_item_approved:
            final_status = 'อนุมัติบางส่วน'
            if all_items_approved_as_requested:
                final_status = 'อนุมัติแล้ว'

        sql_update_header = "UPDATE requisitions SET status = %s, approved_by_id = %s, approver_hcode = %s, approval_date = CURDATE(), updated_at = NOW() WHERE id = %s"
        cursor.execute(sql_update_header, (final_status, approved_by_id, approver_hcode, requisition_id))

        conn.commit()
        return jsonify({"message": f"ดำเนินการใบเบิก ID {requisition_id} สำเร็จ สถานะใหม่คือ {final_status}"}), 200

    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"เกิดข้อผิดพลาดในการดำเนินการใบเบิก: {e}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@requisition_bp.route('/suggest-auto-items', methods=['GET'])
def suggest_auto_requisition_items():
    hcode = request.args.get('hcode')
    if not hcode:
        return jsonify({"error": "hcode parameter is required"}), 400

    query = """
        SELECT
            m.id AS medicine_id, m.medicine_code, m.generic_name, m.strength, m.unit,
            m.min_stock, m.max_stock,
            COALESCE(inv_sum.current_stock, 0) AS total_quantity_on_hand
        FROM medicines m
        LEFT JOIN (
            SELECT medicine_id, hcode, SUM(quantity_on_hand) AS current_stock
            FROM inventory
            WHERE hcode = %s  -- Filter inventory by hcode here as well
            GROUP BY medicine_id, hcode
        ) AS inv_sum ON m.id = inv_sum.medicine_id AND m.hcode = inv_sum.hcode -- Ensure join uses m.hcode
        WHERE m.hcode = %s AND m.is_active = TRUE AND m.min_stock > 0
        ORDER BY m.generic_name;
    """
    # Note: The subquery for inv_sum also needs to be filtered by hcode for accuracy,
    # or ensure the outer m.hcode = inv_sum.hcode join is sufficient.
    # The provided query structure is generally okay if inv_sum.hcode is correctly matched.
    # For clarity and safety, adding hcode filter in subquery is better.
    
    medicines = db_execute_query(query, (hcode, hcode), fetchall=True) # Pass hcode twice

    if medicines is None:
        return jsonify({"error": "Could not fetch medicine data for suggestions."}), 500

    suggested_items = []
    for item in medicines:
        current_stock = item.get('total_quantity_on_hand', 0)
        min_val = item.get('min_stock', 0)
        max_val = item.get('max_stock', 0)

        # Ensure min_val and max_val are not None before comparison
        min_val = min_val if min_val is not None else 0
        max_val = max_val if max_val is not None else 0
        current_stock = current_stock if current_stock is not None else 0

        quantity_to_request = 0

        if current_stock < min_val:
            if max_val > 0 and max_val > current_stock:
                quantity_to_request = max_val - current_stock
            else:
                quantity_to_request = min_val - current_stock
        
        if quantity_to_request > 0:
            # Create a dictionary for the suggested item, copying necessary fields
            suggestion = {
                'medicine_id': item['medicine_id'],
                'medicine_code': item['medicine_code'],
                'generic_name': item['generic_name'],
                'strength': item['strength'],
                'unit': item['unit'],
                'min_stock': min_val,
                'max_stock': max_val,
                'total_quantity_on_hand': current_stock,
                'quantity_to_request': math.ceil(quantity_to_request)
            }
            suggested_items.append(suggestion)

    return jsonify(suggested_items)
