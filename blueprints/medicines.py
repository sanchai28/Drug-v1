# /blueprints/medicines.py

from flask import Blueprint, request, jsonify
from helpers.database import db_execute_query
from mysql.connector import Error

# สร้าง Blueprint สำหรับ medicines
# ทุก endpoint ในไฟล์นี้จะขึ้นต้นด้วย /api/medicines
medicine_bp = Blueprint('medicines', __name__, url_prefix='/api/medicines')

@medicine_bp.route('/', methods=['GET'])
def get_medicines_endpoint(): 
    """
    ดึงข้อมูลยาทั้งหมดสำหรับหน่วยบริการที่ระบุ
    Query Params: hcode (required)
    """
    user_hcode = request.args.get('hcode') 
    
    if not user_hcode: 
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400
        
    query = """
        SELECT
            m.id, m.hcode, m.medicine_code, m.generic_name, m.strength, m.unit,
            m.reorder_point, m.min_stock, m.max_stock, m.lead_time_days, m.review_period_days,
            m.is_active,
            COALESCE(inv_sum.current_stock, 0) AS total_quantity_on_hand
        FROM medicines m
        LEFT JOIN (
            SELECT medicine_id, hcode, SUM(quantity_on_hand) AS current_stock
            FROM inventory
            GROUP BY medicine_id, hcode
        ) AS inv_sum ON m.id = inv_sum.medicine_id AND m.hcode = inv_sum.hcode
        WHERE m.hcode = %s AND m.is_active = TRUE
        ORDER BY m.generic_name
    """ 
    medicines_data = db_execute_query(query, (user_hcode,), fetchall=True) 
    if medicines_data is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลยาได้"}), 500
    return jsonify(medicines_data)

@medicine_bp.route('/search', methods=['GET'])
def search_medicines():
    """
    ค้นหายาด้วย medicine_code หรือ generic_name
    Query Params: term (required), hcode (required)
    """
    search_term = request.args.get('term', '')
    user_hcode = request.args.get('hcode') 

    if not user_hcode:
        return jsonify({"error": "กรุณาระบุ hcode สำหรับการค้นหายา"}), 400
    if not search_term or len(search_term) < 1:
        return jsonify([]) 

    query = """
        SELECT
            m.id, m.medicine_code, m.generic_name, m.strength, m.unit,
            m.min_stock, m.max_stock,
            COALESCE(inv_sum.current_stock, 0) AS total_quantity_on_hand
        FROM medicines m
        LEFT JOIN (
            SELECT medicine_id, hcode, SUM(quantity_on_hand) AS current_stock
            FROM inventory
            GROUP BY medicine_id, hcode
        ) AS inv_sum ON m.id = inv_sum.medicine_id AND m.hcode = inv_sum.hcode
        WHERE m.is_active = TRUE AND m.hcode = %s AND (m.medicine_code LIKE %s OR m.generic_name LIKE %s)
        ORDER BY m.generic_name
        LIMIT 10
    """
    like_term = f"%{search_term}%"
    params = (user_hcode, like_term, like_term)
    
    medicines_data = db_execute_query(query, params, fetchall=True)
    if medicines_data is None:
        return jsonify({"error": "เกิดข้อผิดพลาดระหว่างค้นหายา"}), 500
    return jsonify(medicines_data)


@medicine_bp.route('/', methods=['POST'])
def add_medicine():
    """
    เพิ่มยาใหม่เข้าสู่ระบบสำหรับหน่วยบริการ
    """
    data = request.get_json()
    required_fields = ['hcode', 'medicine_code', 'generic_name', 'unit']
    if not data or not all(k in data for k in required_fields):
        return jsonify({"error": f"ข้อมูลไม่ครบถ้วน, ต้องมี: {', '.join(required_fields)}"}), 400

    hcode = data['hcode']
    sql = """
        INSERT INTO medicines (
            hcode, medicine_code, generic_name, strength, unit, 
            reorder_point, min_stock, max_stock, lead_time_days, review_period_days, 
            is_active
        ) 
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
    """
    params = (
        hcode,
        data['medicine_code'],
        data['generic_name'],
        data.get('strength'),
        data['unit'],
        data.get('reorder_point', 0),
        data.get('min_stock', 0),
        data.get('max_stock', 0),
        data.get('lead_time_days', 0),
        data.get('review_period_days', 0)
    )
    try:
        new_medicine_id = db_execute_query(sql, params, commit=True, get_last_id=True)
        if new_medicine_id:
            created_medicine_query = """
                SELECT id, hcode, medicine_code, generic_name, strength, unit, 
                       reorder_point, min_stock, max_stock, lead_time_days, review_period_days, 
                       is_active 
                FROM medicines WHERE id = %s
            """
            created_medicine = db_execute_query(created_medicine_query, (new_medicine_id,), fetchone=True)
            return jsonify({"message": "เพิ่มยาใหม่สำเร็จ", "medicine": created_medicine}), 201
        else:
            return jsonify({"error": "ไม่สามารถเพิ่มยาได้"}), 500
    except Error as e:
        error_msg = getattr(e, 'msg', str(e))
        if getattr(e, 'errno', 0) == 1062:
            return jsonify({"error": f"ไม่สามารถเพิ่มยาได้: รหัสยา {data['medicine_code']} อาจมีอยู่แล้วสำหรับหน่วยบริการนี้. ({error_msg})"}), 409
        return jsonify({"error": f"เกิดข้อผิดพลาดในฐานข้อมูล: {error_msg}"}), 500

@medicine_bp.route('/<int:medicine_id>', methods=['PUT'])
def update_medicine(medicine_id):
    """
    อัปเดตข้อมูลยาที่มีอยู่
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400

    original_medicine = db_execute_query("SELECT * FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
    if not original_medicine:
        return jsonify({"error": "ไม่พบรายการยา"}), 404
    
    current_hcode = original_medicine['hcode']

    # Prepare field values, using original values as defaults
    fields_to_set = {
        'medicine_code': data.get('medicine_code', original_medicine['medicine_code']),
        'generic_name': data.get('generic_name', original_medicine['generic_name']),
        'strength': data.get('strength', original_medicine['strength']),
        'unit': data.get('unit', original_medicine['unit']),
        'reorder_point': data.get('reorder_point', original_medicine['reorder_point']),
        'min_stock': data.get('min_stock', original_medicine['min_stock']),
        'max_stock': data.get('max_stock', original_medicine['max_stock']),
        'lead_time_days': data.get('lead_time_days', original_medicine['lead_time_days']),
        'review_period_days': data.get('review_period_days', original_medicine['review_period_days']),
        'is_active': data.get('is_active', original_medicine['is_active'])
    }

    # Check for medicine_code uniqueness if it's being changed
    if fields_to_set['medicine_code'] != original_medicine['medicine_code']:
        existing_med_check = db_execute_query(
            "SELECT id FROM medicines WHERE hcode = %s AND medicine_code = %s AND id != %s",
            (current_hcode, fields_to_set['medicine_code'], medicine_id),
            fetchone=True
        )
        if existing_med_check:
            return jsonify({"error": f"รหัสยา '{fields_to_set['medicine_code']}' มีอยู่แล้วสำหรับหน่วยบริการนี้"}), 409
    
    # Ensure boolean for is_active
    if 'is_active' in fields_to_set and not isinstance(fields_to_set['is_active'], bool):
        fields_to_set['is_active'] = str(fields_to_set['is_active']).lower() in ['true', '1']


    update_query_parts = [f"`{key}` = %s" for key in fields_to_set.keys()]
    query_params = list(fields_to_set.values())
    query_params.extend([medicine_id, current_hcode])

    query = f"UPDATE medicines SET {', '.join(update_query_parts)} WHERE id = %s AND hcode = %s"

    try:
        # Execute the update. For commit=True, db_execute_query returns None if not get_last_id.
        # The concept of 'rows_affected' needs to come from the cursor directly if db_execute_query is not modified.
        # For now, just execute and then re-fetch to confirm.
        db_execute_query(query, tuple(query_params), commit=True) 
        
        # Fetch the updated medicine data to return
        updated_medicine_query = """
            SELECT id, hcode, medicine_code, generic_name, strength, unit, 
                   reorder_point, min_stock, max_stock, lead_time_days, review_period_days, 
                   is_active 
            FROM medicines WHERE id = %s
        """
        updated_medicine = db_execute_query(updated_medicine_query, (medicine_id,), fetchone=True)
        
        if not updated_medicine: 
            # This implies the medicine_id became invalid after update, which is highly unlikely
            # or the original_medicine check at the start was insufficient (e.g. hcode mismatch for update)
            # However, the query includes "AND hcode = %s" so it should be fine.
            # This path more likely means the medicine was deleted by another process, or ID is wrong.
            # Since we checked original_medicine exists, this is an edge case.
            return jsonify({"error": "ไม่พบรายการยาหลังจากพยายามอัปเดต หรือ ID ไม่ถูกต้อง"}), 404

        # If we reach here, the query executed. We can't easily get row_count without changing db_execute_query.
        # We assume success if no exception and updated_medicine is found.
        return jsonify({"message": f"แก้ไขข้อมูลยา ID {medicine_id} สำเร็จ", "medicine": updated_medicine})
    except Error as e:
        error_msg = getattr(e, 'msg', str(e))
        if getattr(e, 'errno', 0) == 1062: # Duplicate entry
            return jsonify({"error": f"ไม่สามารถอัปเดตยาได้: รหัสยา '{fields_to_set['medicine_code']}' อาจมีอยู่แล้ว. ({error_msg})"}), 409
        return jsonify({"error": f"เกิดข้อผิดพลาดในฐานข้อมูลขณะอัปเดต: {error_msg}"}), 500

@medicine_bp.route('/<int:medicine_id>/toggle_active', methods=['PUT'])
def toggle_medicine_active_status(medicine_id):
    """
    เปิด/ปิดสถานะการใช้งานของยา
    """
    data = request.get_json()
    is_active_from_request = data.get('is_active')

    if is_active_from_request is None:
        return jsonify({"error": "สถานะ is_active ไม่ได้ระบุ"}), 400
    
    is_active_bool = bool(is_active_from_request)

    query = "UPDATE medicines SET is_active = %s WHERE id = %s"
    try:
        # Execute the update. db_execute_query returns None for commit=True.
        db_execute_query(query, (is_active_bool, medicine_id), commit=True)

        # To confirm the change or if it was already in that state, we should re-fetch or check.
        # However, the original logic tried to use rows_affected.
        # For now, fixing the TypeError and assuming success if no exception.
        # A more robust check would re-fetch the status or have db_execute_query return rowcount.
        
        check_exists = db_execute_query("SELECT id, is_active FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
        if not check_exists:
            return jsonify({"error": f"ไม่พบรายการยา ID {medicine_id} หลังพยายามอัปเดตสถานะ"}), 404

        action_text = "เปิดใช้งาน" if bool(check_exists['is_active']) else "ปิดใช้งาน" # Use actual status from DB
        
        if bool(check_exists['is_active']) == is_active_bool:
             # This means the state is now as requested. Could be it was already so, or successfully changed.
            return jsonify({"message": f"ยา ID {medicine_id} ขณะนี้มีสถานะ '{action_text}'"}), 200
        else:
            # This case should ideally not be reached if the update was successful and db is consistent.
            # It might indicate a caching issue or a very fast subsequent change, or update didn't apply.
            # For now, this indicates an issue post-update attempt.
             return jsonify({"error": f"สถานะยา ID {medicine_id} ไม่ตรงกับที่ร้องขอหลังจากการอัปเดต"}), 500

    except Error as e:
        error_msg = getattr(e, 'msg', str(e))
        return jsonify({"error": f"เกิดข้อผิดพลาดในฐานข้อมูล: {error_msg}"}), 500