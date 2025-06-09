# /blueprints/inventory.py

from flask import Blueprint, request, jsonify
from helpers.database import db_execute_query
from helpers.utils import thai_to_iso_date, iso_to_thai_date
from mysql.connector import Error
import logging

# ตั้งค่า logging เพื่อช่วยในการตรวจสอบข้อผิดพลาด
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# สร้าง Blueprint สำหรับ inventory
inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')


@inventory_bp.route('/', methods=['GET'])
def get_inventory_summary():
    """
    ดึงข้อมูลสรุปคลังยาสำหรับหน่วยบริการ
    แสดงยอดคงเหลือรวมและสถานะของยาแต่ละรายการ (ปกติ, ใกล้หมด, หมด)
    """
    user_hcode = request.args.get('hcode')
    user_role = request.args.get('role')
    
    if not user_hcode and user_role != 'ผู้ดูแลระบบ':
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400

    base_query = """
        SELECT
            m.id AS medicine_id,
            m.medicine_code,
            m.generic_name,
            m.strength,
            m.unit,
            m.reorder_point,
            COALESCE(i_sum.total_quantity, 0) AS total_quantity_on_hand,
            (CASE
                WHEN COALESCE(i_sum.total_quantity, 0) <= 0 THEN 'หมด'
                WHEN COALESCE(i_sum.total_quantity, 0) <= m.reorder_point THEN 'ใกล้หมด'
                ELSE 'ปกติ'
            END) AS status
        FROM medicines m
        LEFT JOIN (
            SELECT medicine_id, hcode, SUM(quantity_on_hand) as total_quantity
            FROM inventory
            GROUP BY medicine_id, hcode
        ) AS i_sum ON m.id = i_sum.medicine_id AND m.hcode = i_sum.hcode
    """
    params = []
    where_clauses = ["m.is_active = TRUE"]
    
    if user_hcode:
        where_clauses.append("m.hcode = %s")
        params.append(user_hcode)

    if where_clauses:
        base_query += " WHERE " + " AND ".join(where_clauses)

    base_query += " ORDER BY m.generic_name;"

    inventory_summary = db_execute_query(base_query, tuple(params) if params else None, fetchall=True)
    if inventory_summary is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลคลังยาได้"}), 500
    
    return jsonify(inventory_summary)


@inventory_bp.route('/history/<int:medicine_id>', methods=['GET'])
def get_inventory_history(medicine_id):
    """
    ดึงประวัติการเคลื่อนไหวของยาที่ระบุ
    พร้อมคำนวณยอดคงเหลือแบบ Real-time ใน Python เพื่อความเข้ากันได้สูงสุดกับ DB versions
    """
    user_hcode = request.args.get('hcode')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')

    if not user_hcode:
        return jsonify({"error": "กรุณาระบุ hcode"}), 400

    start_date_iso = thai_to_iso_date(start_date_thai) if start_date_thai else None
    end_date_iso = thai_to_iso_date(end_date_thai) if end_date_thai else None
    
    try:
        # --- ขั้นตอนที่ 1: คำนวณยอดคงเหลือเริ่มต้น (ก่อนช่วงวันที่ที่เลือก) ---
        initial_balance_q = "SELECT COALESCE(SUM(quantity_change), 0) as balance FROM inventory_transactions WHERE hcode = %s AND medicine_id = %s"
        initial_balance_params = [user_hcode, medicine_id]
        
        if start_date_iso:
            initial_balance_q += " AND DATE(transaction_date) < %s"
            initial_balance_params.append(start_date_iso)
            
        initial_balance_res = db_execute_query(initial_balance_q, tuple(initial_balance_params), fetchone=True)
        running_balance = initial_balance_res['balance'] if initial_balance_res else 0

        # --- ขั้นตอนที่ 2: ดึงรายการเคลื่อนไหวทั้งหมดในช่วงวันที่ที่เลือก ---
        query_conditions = ["it.hcode = %s", "it.medicine_id = %s"]
        params = [user_hcode, medicine_id]
        
        if start_date_iso:
            query_conditions.append("DATE(it.transaction_date) >= %s")
            params.append(start_date_iso)
        if end_date_iso:
            query_conditions.append("DATE(it.transaction_date) <= %s")
            params.append(end_date_iso)
            
        query = f"""
            SELECT
                it.id, it.transaction_date, it.transaction_type, it.lot_number, it.expiry_date,
                it.quantity_change, it.reference_document_id, it.external_reference_guid,
                it.remarks, u.full_name as user_full_name
            FROM inventory_transactions it
            JOIN users u ON it.user_id = u.id
            WHERE {" AND ".join(query_conditions)}
            ORDER BY it.transaction_date ASC, it.id ASC;
        """
        history_raw = db_execute_query(query, tuple(params), fetchall=True)

        if history_raw is None: 
            return jsonify({"error": "ไม่สามารถดึงประวัติยาได้ (DB Error)"}), 500

        # --- ขั้นตอนที่ 3: ประมวลผลใน Python เพื่อคำนวณยอดคงเหลือแต่ละรายการ ---
        processed_history = []
        for item in history_raw:
            item['quantity_before_transaction'] = running_balance
            running_balance += item['quantity_change']
            item['quantity_after_transaction'] = running_balance
            
            item['transaction_date'] = item['transaction_date'].strftime('%d/%m/%Y %H:%M:%S') if item.get('transaction_date') else '-'
            item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
            
            processed_history.append(item)
            
        return jsonify(processed_history)

    except Error as e: 
        logger.error(f"Error getting inventory history: {e}", exc_info=True)
        return jsonify({"error": f"เกิดข้อผิดพลาดในการดึงข้อมูลประวัติยา: {e}"}), 500
    except Exception as ex:
        logger.error(f"General error getting inventory history: {ex}", exc_info=True)
        return jsonify({"error": f"เกิดข้อผิดพลาดทั่วไป: {ex}"}), 500


@inventory_bp.route('/lots', methods=['GET'])
def get_medicine_lots_in_inventory():
    """
    ดึงข้อมูล Lot ทั้งหมดของยาที่ระบุที่มีในคลัง
    """
    medicine_id_str = request.args.get('medicine_id')
    hcode = request.args.get('hcode')
    
    if not medicine_id_str or not hcode:
        return jsonify({"error": "กรุณาระบุ medicine_id และ hcode"}), 400
    try:
        medicine_id = int(medicine_id_str)
    except ValueError:
        return jsonify({"error": "medicine_id ไม่ถูกต้อง"}), 400
        
    query = """
        SELECT lot_number, expiry_date, quantity_on_hand 
        FROM inventory 
        WHERE medicine_id = %s AND hcode = %s AND quantity_on_hand > 0 
        ORDER BY expiry_date ASC, id ASC;
    """
    lots = db_execute_query(query, (medicine_id, hcode), fetchall=True)
    if lots is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูล Lot ของยาได้"}), 500
    
    for lot in lots:
        lot['expiry_date_iso'] = str(lot['expiry_date'])
        lot['expiry_date_thai'] = iso_to_thai_date(lot['expiry_date'])
        lot['expiry_date'] = iso_to_thai_date(lot['expiry_date'])
        
    return jsonify(lots)
