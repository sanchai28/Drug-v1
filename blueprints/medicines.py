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
        SELECT id, hcode, medicine_code, generic_name, strength, unit, reorder_point, is_active 
        FROM medicines 
        WHERE hcode = %s 
        ORDER BY generic_name
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
        SELECT id, medicine_code, generic_name, strength, unit 
        FROM medicines 
        WHERE is_active = TRUE AND hcode = %s AND (medicine_code LIKE %s OR generic_name LIKE %s)
        ORDER BY generic_name
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
    if not data or not all(k in data for k in ['hcode', 'medicine_code', 'generic_name', 'unit']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (hcode, medicine_code, generic_name, unit)"}), 400

    hcode = data['hcode']
    query = """
        INSERT INTO medicines (hcode, medicine_code, generic_name, strength, unit, reorder_point, is_active) 
        VALUES (%s, %s, %s, %s, %s, %s, TRUE)
    """
    params = (
        hcode,
        data['medicine_code'], 
        data['generic_name'], 
        data.get('strength'), 
        data['unit'], 
        data.get('reorder_point', 0)
    )
    try:
        new_medicine_id = db_execute_query(query, params, commit=True, get_last_id=True)
        if new_medicine_id:
            created_medicine = db_execute_query("SELECT * FROM medicines WHERE id = %s", (new_medicine_id,), fetchone=True)
            return jsonify({"message": "เพิ่มยาใหม่สำเร็จ", "medicine": created_medicine}), 201
        else: 
            return jsonify({"error": "ไม่สามารถเพิ่มยาได้"}), 500
    except Error as e: 
        return jsonify({"error": f"ไม่สามารถเพิ่มยาได้: รหัสยา {data['medicine_code']} อาจมีอยู่แล้วสำหรับหน่วยบริการนี้"}), 409


@medicine_bp.route('/<int:medicine_id>', methods=['PUT'])
def update_medicine(medicine_id):
    """
    อัปเดตข้อมูลยาที่มีอยู่
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400
    
    original_medicine = db_execute_query("SELECT hcode, medicine_code FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
    if not original_medicine:
        return jsonify({"error": "ไม่พบรายการยา"}), 404
    
    new_medicine_code = data.get('medicine_code')
    
    if new_medicine_code and new_medicine_code != original_medicine['medicine_code']:
        existing_med_with_code = db_execute_query(
            "SELECT id FROM medicines WHERE hcode = %s AND medicine_code = %s AND id != %s",
            (original_medicine['hcode'], new_medicine_code, medicine_id),
            fetchone=True
        )
        if existing_med_with_code:
            return jsonify({"error": f"รหัสยา '{new_medicine_code}' มีอยู่แล้วสำหรับหน่วยบริการนี้"}), 409

    query = """
        UPDATE medicines 
        SET medicine_code = %s, generic_name = %s, strength = %s, unit = %s, reorder_point = %s, is_active = %s
        WHERE id = %s AND hcode = %s 
    """ 
    params = (
        data.get('medicine_code', original_medicine['medicine_code']),
        data.get('generic_name'), 
        data.get('strength'), 
        data.get('unit'), 
        data.get('reorder_point'),
        data.get('is_active', True), 
        medicine_id,
        original_medicine['hcode'] 
    )
    db_execute_query(query, params, commit=True) 
    updated_medicine = db_execute_query("SELECT * FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
    return jsonify({"message": f"แก้ไขข้อมูลยา ID {medicine_id} สำเร็จ", "medicine": updated_medicine})

@medicine_bp.route('/<int:medicine_id>/toggle_active', methods=['PUT'])
def toggle_medicine_active_status(medicine_id):
    """
    เปิด/ปิดสถานะการใช้งานของยา
    """
    data = request.get_json()
    is_active = data.get('is_active')
    if is_active is None:
        return jsonify({"error": "สถานะ is_active ไม่ได้ระบุ"}), 400
    query = "UPDATE medicines SET is_active = %s WHERE id = %s"
    db_execute_query(query, (bool(is_active), medicine_id), commit=True)
    action_text = "เปิดใช้งาน" if bool(is_active) else "ปิดใช้งาน"
    return jsonify({"message": f"ยา ID {medicine_id} ถูก{action_text}แล้ว"})