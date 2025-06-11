# /blueprints/inventory.py

from flask import Blueprint, request, jsonify
from helpers.database import db_execute_query
from helpers.utils import thai_to_iso_date, iso_to_thai_date
from mysql.connector import Error
import logging
from datetime import datetime, timedelta # Added
import math # Added

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
            m.min_stock, 
            m.max_stock,
            COALESCE(i_sum.total_quantity, 0) AS total_quantity_on_hand,
            (CASE
                WHEN COALESCE(i_sum.total_quantity, 0) <= 0 THEN 'หมด'
                WHEN m.min_stock IS NOT NULL AND m.min_stock > 0 AND COALESCE(i_sum.total_quantity, 0) <= m.min_stock THEN 'ต่ำกว่า Min'
                WHEN m.max_stock IS NOT NULL AND m.max_stock > 0 AND COALESCE(i_sum.total_quantity, 0) > m.max_stock THEN 'เกิน Max'
                WHEN m.min_stock IS NOT NULL AND m.min_stock > 0 AND (m.max_stock IS NULL OR m.max_stock = 0 OR COALESCE(i_sum.total_quantity, 0) <= m.max_stock) THEN 'ปกติ'
                WHEN (m.min_stock IS NULL OR m.min_stock = 0) AND m.reorder_point > 0 AND COALESCE(i_sum.total_quantity, 0) <= m.reorder_point THEN 'ใกล้ Reorder Point'
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
                it.quantity_change, it.reference_document_id,
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
        lot['expiry_date'] = iso_to_thai_date(lot['expiry_date']) # Keep original format for display consistency if any
        
    return jsonify(lots)

@inventory_bp.route('/calculate-min-max', methods=['POST'])
def calculate_min_max_stock():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    hcode = data.get('hcode')
    medicine_id_filter = data.get('medicine_id') # Optional
    calculation_period_days = data.get('calculation_period_days', 90)

    if not hcode:
        return jsonify({"error": "hcode is required"}), 400
    
    try: # Ensure calculation_period_days is an int
        calculation_period_days = int(calculation_period_days)
    except ValueError:
        calculation_period_days = 90
        
    if calculation_period_days <= 0:
        calculation_period_days = 90

    try:
        medicines_query_base = """
            SELECT id, generic_name, lead_time_days, review_period_days
            FROM medicines 
            WHERE hcode = %s AND is_active = TRUE
        """
        # Note: safety_stock_days is not included here as it's not confirmed to be in DB schema yet.
        # If it were, it would be: SELECT id, generic_name, lead_time_days, review_period_days, safety_stock_days
        
        medicines_params = [hcode]

        if medicine_id_filter:
            try:
                medicine_id_val = int(medicine_id_filter)
                medicines_query_base += " AND id = %s"
                medicines_params.append(medicine_id_val)
            except ValueError:
                return jsonify({"error": "Invalid medicine_id format."}), 400
        
        medicines_to_process = db_execute_query(medicines_query_base, tuple(medicines_params), fetchall=True)

        if medicines_to_process is None: # Indicates a DB query execution error in db_execute_query
            logger.error(f"Failed to fetch medicines for hcode {hcode}, medicine_id_filter {medicine_id_filter}")
            return jsonify({"error": "Could not fetch medicines for calculation due to a database error."}), 500
        
        if not medicines_to_process:
            return jsonify({"message": "No active medicines found matching the criteria for this hcode."}), 200

        updated_count = 0
        results_details = [] 

        today = datetime.now().date()
        start_date_adu = today - timedelta(days=calculation_period_days)

        for med in medicines_to_process:
            lead_time_days = med.get('lead_time_days', 0) if med.get('lead_time_days') is not None else 0
            review_period_days = med.get('review_period_days', 0) if med.get('review_period_days') is not None else 0
            # safety_stock_days = med.get('safety_stock_days', 0) # Omitted for now

            adu_query = """
                SELECT SUM(ABS(quantity_change)) as total_dispensed
                FROM inventory_transactions
                WHERE medicine_id = %s
                  AND hcode = %s
                  AND transaction_type IN ('จ่ายออก-ผู้ป่วย', 'ตัดจ่ายยา', 'จ่ายออก', 'Dispense') 
                  AND DATE(transaction_date) BETWEEN %s AND %s
            """
            # Added 'Dispense' as another possible transaction_type string
            adu_params = (med['id'], hcode, start_date_adu.isoformat(), today.isoformat())
            dispensing_data = db_execute_query(adu_query, adu_params, fetchone=True)

            total_dispensed = 0
            if dispensing_data and dispensing_data['total_dispensed'] is not None:
                total_dispensed = float(dispensing_data['total_dispensed']) # Ensure float for division

            adu = 0.0
            if calculation_period_days > 0 and total_dispensed > 0:
                adu = total_dispensed / calculation_period_days
            
            # Min Stock: (ADU * Lead Time)
            calculated_min_stock = adu * float(lead_time_days) 
            
            # Max Stock: Min Stock + (ADU * Review Period)
            calculated_max_stock = calculated_min_stock + (adu * float(review_period_days))

            final_min_stock = int(math.ceil(calculated_min_stock))
            final_max_stock = int(math.ceil(calculated_max_stock))

            if final_max_stock < final_min_stock:
                final_max_stock = final_min_stock 

            update_med_query = """
                UPDATE medicines 
                SET min_stock = %s, max_stock = %s 
                WHERE id = %s AND hcode = %s
            """
            update_params = (final_min_stock, final_max_stock, med['id'], hcode)
            
            # Execute the update. db_execute_query with commit=True (and no get_last_id) returns None.
            # Errors during execution should be caught by the broader try-except blocks.
            db_execute_query(update_med_query, update_params, commit=True)
            
            # If we reach here, the query was executed and committed without raising an
            # exception that propagated to the main try-except blocks.
            # We consider this item processed for update.
            current_update_success = True 
            updated_count += 1
            # Note: The specific information about whether 0 rows or N rows were affected by the UPDATE
            # is not available here without modifying db_execute_query to return cursor.rowcount.
            # The current logic assumes an attempt was made and no critical error stopped it.

            results_details.append({
                "medicine_id": med['id'],
                "generic_name": med['generic_name'],
                "adu": round(adu, 3),
                "lead_time_days": lead_time_days,
                "review_period_days": review_period_days,
                "calculated_min_stock_raw": round(calculated_min_stock,3),
                "calculated_max_stock_raw": round(calculated_max_stock,3),
                "final_min_stock": final_min_stock,
                "final_max_stock": final_max_stock,
                "updated_successfully": current_update_success
            })

        return jsonify({
            "message": f"{updated_count} of {len(medicines_to_process)} medicines had their Min/Max stock levels updated/processed.",
            "details": results_details
        }), 200

    except Error as e:
        logger.error(f"Database error during Min/Max calculation for hcode {hcode}: {e}", exc_info=True)
        # It's good to check e.msg as not all Error instances might have it clearly.
        error_message = getattr(e, 'msg', str(e))
        return jsonify({"error": f"Database error: {error_message}"}), 500
    except Exception as ex:
        logger.error(f"General error during Min/Max calculation for hcode {hcode}: {ex}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(ex)}"}), 500
