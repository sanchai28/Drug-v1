# app.py
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import mysql.connector
from flask import send_from_directory
from mysql.connector import Error
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash # Import for password hashing
import pandas as pd
from io import BytesIO
app = Flask(__name__)
CORS(app) 


@app.route('/')
@app.route('/index')
def index():
    return render_template('index.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

# --- Database Configuration ---
# !!! กรุณาแก้ไขค่าเหล่านี้ให้ตรงกับการตั้งค่า MySQL ของคุณ !!!
DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'sa',        # แก้ไข
    'password': 'sa',  # แก้ไข
    'database': 'shph_inventory_db' # ชื่อฐานข้อมูลจากไฟล์ .sql
}

# --- Database Helper Functions ---
def get_db_connection():
    """สร้างการเชื่อมต่อกับฐานข้อมูล MySQL"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Error connecting to MySQL database: {e}")
        return None

def db_execute_query(query, params=None, fetchone=False, fetchall=False, commit=False, get_last_id=False, cursor_to_use=None):
    """
    Execute a database query.
    If cursor_to_use is provided, it uses the existing cursor and connection,
    otherwise, it creates a new connection.
    """
    conn = None
    is_external_cursor = cursor_to_use is not None
    cursor = cursor_to_use
    result = None

    try:
        if not is_external_cursor:
            conn = get_db_connection()
            if conn is None:
                print("Failed to get database connection.")
                return None
            cursor = conn.cursor(dictionary=True) # Ensure dictionary=True for consistent results
        
        # print(f"Executing query: {query} with params: {params}") # For debugging
        cursor.execute(query, params)

        if commit:
            if not is_external_cursor: 
                conn.commit()
                # print("Transaction committed.") # For debugging
            if get_last_id:
                result = cursor.lastrowid
        elif fetchone:
            result = cursor.fetchone()
        elif fetchall:
            result = cursor.fetchall()
        
        return result
    except Error as e:
        print(f"Database Error: {e} for query: {query} with params: {params}")
        if conn and commit and not is_external_cursor: 
            print("Rolling back transaction due to error.") # For debugging
            conn.rollback()
        return None # Or raise an exception for more specific error handling in routes
    finally:
        if not is_external_cursor:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

# --- Date Helper Functions ---
def thai_to_iso_date(thai_date_str):
    if not thai_date_str: return None
    try:
        parts = thai_date_str.split('/')
        if len(parts) != 3: return None
        day, month, buddhist_year = int(parts[0]), int(parts[1]), int(parts[2])
        if buddhist_year < 2500: return None
        christian_year = buddhist_year - 543
        if not (1 <= month <= 12 and 1 <= day <= 31): return None
        return f"{christian_year:04d}-{month:02d}-{day:02d}"
    except ValueError: return None

def iso_to_thai_date(iso_date_str):
    if not iso_date_str: return None
    try:
        if isinstance(iso_date_str, str): date_obj = datetime.strptime(iso_date_str, '%Y-%m-%d').date()
        elif isinstance(iso_date_str, datetime): date_obj = iso_date_str.date()
        elif hasattr(iso_date_str, 'year') and hasattr(iso_date_str, 'month') and hasattr(iso_date_str, 'day'): date_obj = iso_date_str
        else: return None
        day, month, buddhist_year = date_obj.strftime('%d'), date_obj.strftime('%m'), date_obj.year + 543
        return f"{day}/{month}/{buddhist_year}"
    except ValueError: return None


# --- API Endpoints ---

@app.route('/api/login', methods=['POST'])
def login_api():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน"}), 400

    username = data['username']
    password_candidate = data['password'] 

    query = "SELECT id, username, password_hash, full_name, role, hcode FROM users WHERE username = %s AND is_active = TRUE"
    user_data = db_execute_query(query, (username,), fetchone=True)

    if user_data:
        # !!! IMPORTANT: Replace with secure password checking in a real application !!!
        # if check_password_hash(user_data['password_hash'], password_candidate):
        if user_data['password_hash'] == password_candidate: # Placeholder for plain text comparison (INSECURE)
            user_info = {
                "id": user_data['id'],
                "username": user_data['username'],
                "full_name": user_data['full_name'],
                "role": user_data['role'],
                "hcode": user_data['hcode'] 
            }
            return jsonify({"message": "เข้าสู่ระบบสำเร็จ", "user": user_info}), 200
        else:
            return jsonify({"error": "รหัสผ่านไม่ถูกต้อง"}), 401
    else:
        return jsonify({"error": "ไม่พบชื่อผู้ใช้งานนี้"}), 404

# == Unit Services ==
@app.route('/api/unitservices', methods=['GET'])
def get_unit_services():
    # TODO: Add role check (Admin only for listing all)
    query = "SELECT hcode, name, type, created_at, updated_at FROM unitservice ORDER BY name"
    unit_services = db_execute_query(query, fetchall=True)
    if unit_services is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลหน่วยบริการได้"}), 500
    for service in unit_services: 
        service['created_at'] = service['created_at'].strftime('%d/%m/%Y %H:%M:%S') if service.get('created_at') else None
        service['updated_at'] = service['updated_at'].strftime('%d/%m/%Y %H:%M:%S') if service.get('updated_at') else None
    return jsonify(unit_services)

@app.route('/api/unitservices', methods=['POST'])
def add_unit_service():
    # TODO: Add role check (Admin only)
    data = request.get_json()
    if not data or not data.get('hcode') or not data.get('name'):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (hcode, name)"}), 400
    
    hcode = data['hcode']
    name = data['name']
    service_type = data.get('type', 'รพสต.') 

    if db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True):
        return jsonify({"error": f"รหัสหน่วยบริการ {hcode} มีอยู่แล้ว"}), 409

    query = "INSERT INTO unitservice (hcode, name, type) VALUES (%s, %s, %s)"
    params = (hcode, name, service_type)
    db_execute_query(query, params, commit=True)
    
    created_service = db_execute_query("SELECT hcode, name, type, created_at, updated_at FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True)
    if created_service:
            created_service['created_at'] = created_service['created_at'].strftime('%d/%m/%Y %H:%M:%S') if created_service.get('created_at') else None
            created_service['updated_at'] = created_service['updated_at'].strftime('%d/%m/%Y %H:%M:%S') if created_service.get('updated_at') else None
            return jsonify({"message": "เพิ่มหน่วยบริการสำเร็จ", "unitservice": created_service}), 201
    return jsonify({"error": "ไม่สามารถเพิ่มหน่วยบริการได้"}), 500

@app.route('/api/unitservices/<string:hcode>', methods=['PUT'])
def update_unit_service(hcode):
    # TODO: Add role check (Admin only)
    data = request.get_json()
    if not data or not data.get('name'): 
        return jsonify({"error": "ข้อมูลชื่อหน่วยบริการ (name) ไม่ครบถ้วน"}), 400
    
    name = data['name']
    new_hcode = data.get('hcode', hcode).strip() # Allow hcode to be changed
    service_type = data.get('type')

    original_service = db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True)
    if not original_service:
        return jsonify({"error": f"ไม่พบหน่วยบริการรหัสเดิม {hcode}"}), 404

    if new_hcode != hcode and db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (new_hcode,), fetchone=True):
        return jsonify({"error": f"รหัสหน่วยบริการใหม่ {new_hcode} มีอยู่แล้ว"}), 409

    update_fields = []
    params = []
    if name is not None:
        update_fields.append("name = %s")
        params.append(name)
    if service_type is not None:
        update_fields.append("type = %s")
        params.append(service_type)
    if new_hcode != hcode: 
        update_fields.append("hcode = %s")
        params.append(new_hcode)
    
    if not update_fields:
        return jsonify({"message": "ไม่มีข้อมูลให้อัปเดต"}), 200

    params.append(hcode) # For the WHERE clause to identify the original record
    query = f"UPDATE unitservice SET {', '.join(update_fields)} WHERE hcode = %s"
    
    db_execute_query(query, tuple(params), commit=True)
    
    final_hcode_to_fetch = new_hcode if new_hcode != hcode else hcode
    updated_service = db_execute_query("SELECT hcode, name, type, created_at, updated_at FROM unitservice WHERE hcode = %s", (final_hcode_to_fetch,), fetchone=True)
    if updated_service:
        updated_service['created_at'] = updated_service['created_at'].strftime('%d/%m/%Y %H:%M:%S') if updated_service.get('created_at') else None
        updated_service['updated_at'] = updated_service['updated_at'].strftime('%d/%m/%Y %H:%M:%S') if updated_service.get('updated_at') else None
        return jsonify({"message": f"แก้ไขข้อมูลหน่วยบริการ {final_hcode_to_fetch} สำเร็จ", "unitservice": updated_service})
    return jsonify({"error": "ไม่สามารถอัปเดตข้อมูลหน่วยบริการได้"}), 500

@app.route('/api/unitservices/<string:hcode>', methods=['DELETE'])
def delete_unit_service(hcode):
    # TODO: Add role check (Admin only)
    if not db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True):
        return jsonify({"error": f"ไม่พบหน่วยบริการรหัส {hcode}"}), 404
        
    # Consider implications of ON DELETE SET NULL for users.hcode
    # Also, consider if unitservice is referenced in other critical tables with RESTRICT
    query = "DELETE FROM unitservice WHERE hcode = %s"
    db_execute_query(query, (hcode,), commit=True)
    return jsonify({"message": f"ลบหน่วยบริการ {hcode} สำเร็จ"})


# == Users ==
@app.route('/api/users', methods=['GET'])
def get_users():
    # TODO: Add role check (Admin only)
    query = """
        SELECT u.id, u.username, u.full_name, u.role, u.hcode, us.name as hcode_name, u.is_active 
        FROM users u
        LEFT JOIN unitservice us ON u.hcode = us.hcode
        ORDER BY u.full_name
    """
    users = db_execute_query(query, fetchall=True)
    if users is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลผู้ใช้งานได้"}), 500
    return jsonify(users)

@app.route('/api/users', methods=['POST'])
def add_user():
    # TODO: Add role check (Admin only)
    data = request.get_json()
    if not data or not all(k in data for k in ['username', 'password', 'full_name', 'role']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (username, password, full_name, role)"}), 400

    username = data['username']
    password = data['password'] 
    full_name = data['full_name']
    role = data['role']
    hcode = data.get('hcode') 

    if db_execute_query("SELECT id FROM users WHERE username = %s", (username,), fetchone=True):
        return jsonify({"error": f"ชื่อผู้ใช้งาน '{username}' มีอยู่แล้ว"}), 409

    # !!! IMPORTANT: Hash the password before storing in a real application !!!
    #password_hash = generate_password_hash(password) # Use Hashing
    password_hash = password # Placeholder for plain text (INSECURE) - REMOVE THIS LINE

    query = """
        INSERT INTO users (username, password_hash, full_name, role, hcode, is_active) 
        VALUES (%s, %s, %s, %s, %s, TRUE)
    """
    params = (username, password_hash, full_name, role, hcode if hcode else None)
    new_user_id = db_execute_query(query, params, commit=True, get_last_id=True)

    if new_user_id:
        created_user = db_execute_query("SELECT id, username, full_name, role, hcode FROM users WHERE id = %s", (new_user_id,), fetchone=True)
        return jsonify({"message": "เพิ่มผู้ใช้งานใหม่สำเร็จ", "user": created_user}), 201
    else:
        return jsonify({"error": "ไม่สามารถเพิ่มผู้ใช้งานได้"}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    # TODO: Add role check (Admin or the user themselves for certain fields)
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400

    current_user_data = db_execute_query("SELECT username, hcode FROM users WHERE id = %s", (user_id,), fetchone=True)
    if not current_user_data:
        return jsonify({"error": "ไม่พบผู้ใช้งาน"}), 404

    full_name = data.get('full_name')
    role = data.get('role')
    hcode = data.get('hcode') 
    is_active = data.get('is_active') 
    new_password = data.get('password') 

    update_parts = []
    params = []

    if full_name is not None:
        update_parts.append("full_name = %s")
        params.append(full_name)
    if role is not None:
        update_parts.append("role = %s")
        params.append(role)
    
    if 'hcode' in data: 
        update_parts.append("hcode = %s")
        params.append(hcode if hcode else None) 

    if is_active is not None:
        update_parts.append("is_active = %s")
        params.append(bool(is_active))
    
    if new_password:
        password_hash = generate_password_hash(new_password) # Use Hashing
        # password_hash = new_password # Placeholder - REMOVE
        update_parts.append("password_hash = %s")
        params.append(password_hash)

    if not update_parts:
        return jsonify({"message": "ไม่มีข้อมูลให้อัปเดต"}), 200

    query = f"UPDATE users SET {', '.join(update_parts)} WHERE id = %s"
    params.append(user_id)
    
    db_execute_query(query, tuple(params), commit=True)
    updated_user = db_execute_query("SELECT id, username, full_name, role, hcode, is_active FROM users WHERE id = %s", (user_id,), fetchone=True)
    return jsonify({"message": f"แก้ไขข้อมูลผู้ใช้งาน ID {user_id} สำเร็จ", "user": updated_user})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    # TODO: Add role check (Admin only)
    # Instead of actual deletion, mark as inactive
    query = "UPDATE users SET is_active = FALSE WHERE id = %s"
    db_execute_query(query, (user_id,), commit=True)
    return jsonify({"message": f"ผู้ใช้งาน ID {user_id} ถูกตั้งเป็นไม่ใช้งานแล้ว"})


# == Medicines (hcode specific) ==
@app.route('/api/medicines', methods=['GET'])
def get_medicines_endpoint(): 
    user_hcode = request.args.get('hcode') 
    # TODO: Add role check. Admin might see all if no hcode, or select.
    
    if not user_hcode: # For now, require hcode for this specific endpoint
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400
        
    query = """
        SELECT id, hcode, medicine_code, generic_name, strength, unit, reorder_point, is_active 
        FROM medicines 
        WHERE hcode = %s 
        ORDER BY generic_name
    """ # Removed is_active = TRUE filter here, frontend can filter or show status
    medicines_data = db_execute_query(query, (user_hcode,), fetchall=True) 
    if medicines_data is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลยาได้"}), 500
    return jsonify(medicines_data)

@app.route('/api/medicines/search', methods=['GET'])
def search_medicines():
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


@app.route('/api/medicines', methods=['POST'])
def add_medicine():
    # TODO: Add role check (Admin or designated staff for their hcode)
    data = request.get_json()
    if not data or not all(k in data for k in ['hcode', 'medicine_code', 'generic_name', 'unit']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (hcode, medicine_code, generic_name, unit)"}), 400

    hcode = data['hcode']
    # TODO: Validate that the logged-in user has permission to add medicine for this hcode

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


@app.route('/api/medicines/<int:medicine_id>', methods=['PUT'])
def update_medicine(medicine_id):
    # TODO: Add role check and hcode context validation
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400
    
    # user_hcode_context = data.get('hcode_context') # From frontend, hcode of user making the change

    original_medicine = db_execute_query("SELECT hcode, medicine_code FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
    if not original_medicine:
        return jsonify({"error": "ไม่พบรายการยา"}), 404
    
    # TODO: Implement permission check: if user_hcode_context != original_medicine['hcode'] AND user_role is not Admin, deny.

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
        original_medicine['hcode'] # Ensure update happens only for the original hcode's record
    )
    db_execute_query(query, params, commit=True) 
    updated_medicine = db_execute_query("SELECT * FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
    return jsonify({"message": f"แก้ไขข้อมูลยา ID {medicine_id} สำเร็จ", "medicine": updated_medicine})

@app.route('/api/medicines/<int:medicine_id>/toggle_active', methods=['PUT'])
def toggle_medicine_active_status(medicine_id):
    # TODO: Add role check and hcode context validation
    data = request.get_json()
    is_active = data.get('is_active')
    if is_active is None:
        return jsonify({"error": "สถานะ is_active ไม่ได้ระบุ"}), 400

    # Ensure the user has permission for the medicine's hcode
    # medicine_hcode = db_execute_query("SELECT hcode FROM medicines WHERE id = %s", (medicine_id,), fetchone=True)
    # if not medicine_hcode or (currentUser.hcode != medicine_hcode['hcode'] and currentUser.role != 'ผู้ดูแลระบบ'):
    #     return jsonify({"error": "ไม่มีสิทธิ์ดำเนินการ"}), 403

    query = "UPDATE medicines SET is_active = %s WHERE id = %s"
    db_execute_query(query, (bool(is_active), medicine_id), commit=True)
    action_text = "เปิดใช้งาน" if bool(is_active) else "ปิดใช้งาน"
    return jsonify({"message": f"ยา ID {medicine_id} ถูก{action_text}แล้ว"})


# == Inventory ==
@app.route('/api/inventory', methods=['GET'])
def get_inventory_summary():
    user_hcode = request.args.get('hcode') 
    user_role = request.args.get('role')
    if not user_hcode and user_role != 'ผู้ดูแลระบบ': return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400
    base_query = """
        SELECT 
            m.id AS medicine_id, 
            m.medicine_code, 
            m.generic_name, 
            m.strength, 
            m.unit,
            COALESCE(SUM(i.quantity_on_hand), 0) AS total_quantity_on_hand,
            (CASE 
                WHEN COALESCE(SUM(i.quantity_on_hand), 0) = 0 THEN 'หมด'
                WHEN COALESCE(SUM(i.quantity_on_hand), 0) <= m.reorder_point THEN 'ใกล้หมด' 
                ELSE 'ปกติ'
            END) AS status
        FROM medicines m
        LEFT JOIN inventory i ON m.id = i.medicine_id AND i.quantity_on_hand > 0
    """
    params = []
    where_clauses = ["m.is_active = TRUE"]
    if user_hcode:
        where_clauses.append("m.hcode = %s")
        params.append(user_hcode)
        # Ensure inventory items are also filtered by the same hcode
        # This join condition ensures we sum inventory only for the medicine's defined hcode
        base_query = base_query.replace("LEFT JOIN inventory i ON m.id = i.medicine_id AND i.quantity_on_hand > 0", 
                                        "LEFT JOIN inventory i ON m.id = i.medicine_id AND i.hcode = m.hcode AND i.quantity_on_hand > 0")
    if where_clauses:
        base_query += " WHERE " + " AND ".join(where_clauses)
    base_query += " GROUP BY m.id, m.medicine_code, m.generic_name, m.strength, m.unit, m.reorder_point ORDER BY m.generic_name;"
    inventory_summary = db_execute_query(base_query, tuple(params) if params else None, fetchall=True)
    if inventory_summary is None: return jsonify({"error": "ไม่สามารถดึงข้อมูลคลังยาได้"}), 500
    return jsonify(inventory_summary)

@app.route('/api/inventory/history/<int:medicine_id>', methods=['GET'])
def get_inventory_history(medicine_id):
    user_hcode = request.args.get('hcode')
    start_date_thai = request.args.get('startDate') 
    end_date_thai = request.args.get('endDate')     

    if not user_hcode: 
        return jsonify({"error": "กรุณาระบุ hcode"}), 400
    
    params = [] # <<<### START WITH EMPTY PARAMS ###>>>
    query_conditions = []

    # Always filter by medicine_id and hcode
    query_conditions.append("it.medicine_id = %s")
    params.append(medicine_id)
    query_conditions.append("it.hcode = %s")
    params.append(user_hcode)

    if start_date_thai:
        start_date_iso = thai_to_iso_date(start_date_thai)
        if start_date_iso: 
            query_conditions.append("DATE(it.transaction_date) >= %s")
            params.append(start_date_iso)
    
    if end_date_thai:
        end_date_iso = thai_to_iso_date(end_date_thai)
        if end_date_iso: 
            query_conditions.append("DATE(it.transaction_date) <= %s")
            params.append(end_date_iso)
        
    query = f"""
        SELECT 
            it.id,
            it.transaction_date, 
            it.transaction_type, 
            it.lot_number, 
            it.expiry_date, 
            it.quantity_change, 
            it.quantity_before_transaction, 
            it.quantity_after_transaction,  
            it.reference_document_id,
            it.remarks,
            u.full_name as user_full_name
        FROM inventory_transactions it
        JOIN users u ON it.user_id = u.id
        WHERE {" AND ".join(query_conditions)}
        ORDER BY it.transaction_date ASC, it.id ASC;
    """
    
    # print(f"DEBUG: Inventory History Query: {query}") # For server-side debugging
    # print(f"DEBUG: Inventory History Params: {tuple(params)}") # For server-side debugging

    try:
        history = db_execute_query(query, tuple(params), fetchall=True)
        if history is None: # This means db_execute_query caught an SQL error and returned None
            return jsonify({"error": "ไม่สามารถดึงประวัติยาได้ (DB Error)"}), 500 
        
        for item in history:
            item['transaction_date'] = item['transaction_date'].strftime('%d/%m/%Y %H:%M:%S') if item.get('transaction_date') else '-'
            item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
        return jsonify(history)
    except Error as e: # Catch error re-raised by db_execute_query
        # This block might not be strictly necessary if db_execute_query always returns None on SQL error
        # and doesn't re-raise, but it's a good safeguard.
        print(f"Caught SQL Error in route: {e}")
        return jsonify({"error": f"เกิดข้อผิดพลาดในการดึงข้อมูลประวัติยา: {e}"}), 500
    except Exception as ex:
        print(f"Caught General Error in route: {ex}")
        return jsonify({"error": f"เกิดข้อผิดพลาดทั่วไป: {ex}"}), 500

@app.route('/api/inventory/lots', methods=['GET'])
def get_medicine_lots_in_inventory():
    medicine_id_str = request.args.get('medicine_id')
    hcode = request.args.get('hcode')
    if not medicine_id_str or not hcode: return jsonify({"error": "กรุณาระบุ medicine_id และ hcode"}), 400
    try: medicine_id = int(medicine_id_str)
    except ValueError: return jsonify({"error": "medicine_id ไม่ถูกต้อง"}), 400
    query = "SELECT lot_number, expiry_date, quantity_on_hand FROM inventory WHERE medicine_id = %s AND hcode = %s AND quantity_on_hand > 0 ORDER BY expiry_date ASC, lot_number ASC;"
    lots = db_execute_query(query, (medicine_id, hcode), fetchall=True)
    if lots is None: return jsonify({"error": "ไม่สามารถดึงข้อมูล Lot ของยาได้"}), 500
    for lot in lots:
        lot['expiry_date_iso'] = str(lot['expiry_date']) 
        lot['expiry_date'] = iso_to_thai_date(lot['expiry_date'])
    return jsonify(lots)

# Helper function to get total stock of a medicine for a specific hcode
def get_total_medicine_stock(hcode, medicine_id, cursor):
    stock_query = "SELECT COALESCE(SUM(quantity_on_hand), 0) as total_stock FROM inventory WHERE hcode = %s AND medicine_id = %s"
    stock_data = db_execute_query(stock_query, (hcode, medicine_id), fetchone=True, cursor_to_use=cursor)
    return stock_data['total_stock'] if stock_data else 0

# == Dispense Medicine (Manual) ==
@app.route('/api/dispense/manual', methods=['POST'])
def manual_dispense():
    data = request.get_json()
    if not data or not all(k in data for k in ['dispense_date', 'dispenser_id', 'hcode', 'items']) or not data['items']:
        return jsonify({"error": "ข้อมูลไม่ครบถ้วนสำหรับการตัดจ่ายยา (ต้องการ dispense_date, dispenser_id, hcode, items)"}), 400
    dispenser_id, hcode = data['dispenser_id'], data['hcode'] 
    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        dispense_date_iso = thai_to_iso_date(data['dispense_date'])
        if not dispense_date_iso: conn.rollback(); return jsonify({"error": "รูปแบบวันที่จ่ายยาไม่ถูกต้อง"}), 400
        
        current_date_str_disp = datetime.now().strftime('%y%m%d')
        cursor.execute("SELECT dispense_record_number FROM dispense_records WHERE hcode = %s AND dispense_record_number LIKE %s ORDER BY id DESC LIMIT 1", (hcode, f"DSP-{hcode}-{current_date_str_disp}-%",))
        last_disp_rec = cursor.fetchone()
        next_disp_seq = 1
        if last_disp_rec:
            try: next_disp_seq = int(last_disp_rec['dispense_record_number'].split('-')[-1]) + 1
            except (IndexError, ValueError): pass
        dispense_record_number = f"DSP-{hcode}-{current_date_str_disp}-{next_disp_seq:03d}"

        sql_dispense_record = "INSERT INTO dispense_records (hcode, dispense_record_number, dispense_date, dispenser_id, remarks, dispense_type) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(sql_dispense_record, (hcode, dispense_record_number, dispense_date_iso, dispenser_id, data.get('remarks', ''), data.get('dispense_type', 'ผู้ป่วยนอก')))
        dispense_record_id = cursor.lastrowid
        
        for item in data['items']:
            if not all(k in item for k in ['medicine_id', 'lot_number', 'expiry_date', 'quantity_dispensed']):
                conn.rollback(); return jsonify({"error": f"ข้อมูลรายการยาไม่ครบถ้วน: {item}"}), 400
            medicine_id, lot_number = item['medicine_id'], item['lot_number']
            expiry_date_iso = thai_to_iso_date(item['expiry_date'])
            if not expiry_date_iso: conn.rollback(); return jsonify({"error": f"รูปแบบวันหมดอายุของยาไม่ถูกต้อง: {item['expiry_date']}"}), 400
            quantity_dispensed = int(item['quantity_dispensed'])
            if quantity_dispensed <= 0: conn.rollback(); return jsonify({"error": "จำนวนที่จ่ายต้องมากกว่า 0"}), 400

            if not db_execute_query("SELECT id FROM medicines WHERE id = %s AND hcode = %s", (medicine_id, hcode), fetchone=True, cursor_to_use=cursor):
                conn.rollback(); return jsonify({"error": f"ยา ID {medicine_id} ไม่ได้ถูกกำหนดไว้สำหรับหน่วยบริการ {hcode}"}), 400
            
            total_stock_before_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)
            inventory_item = db_execute_query("SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)
            if not inventory_item or inventory_item['quantity_on_hand'] < quantity_dispensed:
                conn.rollback()
                med_info = db_execute_query("SELECT generic_name FROM medicines WHERE id = %s", (medicine_id,), fetchone=True, cursor_to_use=cursor)
                med_name_for_error = med_info['generic_name'] if med_info else f"ID {medicine_id}"
                return jsonify({"error": f"ยา {med_name_for_error} Lot {lot_number} ที่หน่วยบริการ {hcode} มีไม่เพียงพอในคลัง หรือไม่พบ Lot/Exp นี้"}), 400
            
            inventory_id = inventory_item['id']
            cursor.execute("UPDATE inventory SET quantity_on_hand = quantity_on_hand - %s WHERE id = %s", (quantity_dispensed, inventory_id))
            total_stock_after_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)
            cursor.execute("INSERT INTO dispense_items (dispense_record_id, medicine_id, lot_number, expiry_date, quantity_dispensed) VALUES (%s, %s, %s, %s, %s)", (dispense_record_id, medicine_id, lot_number, expiry_date_iso, quantity_dispensed))
            cursor.execute("INSERT INTO inventory_transactions (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", 
                           (hcode, medicine_id, lot_number, expiry_date_iso, 'จ่ายออก-ผู้ป่วย', -quantity_dispensed, total_stock_before_item_txn, total_stock_after_item_txn, dispense_record_number, dispenser_id, data.get('remarks_item', "ตัดจ่ายยา")))
        conn.commit()
        return jsonify({"message": "บันทึกการตัดจ่ายยาสำเร็จ", "dispense_record_id": dispense_record_id, "dispense_record_number": dispense_record_number}), 201
    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.route('/api/dispense_records', methods=['GET'])
def get_dispense_records():
    user_hcode = request.args.get('hcode')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')
    
    if not user_hcode and request.args.get('user_role') != 'ผู้ดูแลระบบ': # Allow admin to potentially see all if no hcode provided
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400

    query = """
        SELECT 
            dr.id, 
            dr.dispense_record_number, 
            dr.dispense_date,
            u.full_name as dispenser_name,
            dr.dispense_type,
            dr.remarks,
            dr.hcode, -- Include hcode of the dispense record
            (SELECT COUNT(*) FROM dispense_items di WHERE di.dispense_record_id = dr.id) as item_count
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

@app.route('/api/dispense_records/<int:record_id>', methods=['GET'])
def get_single_dispense_record(record_id):
    # TODO: Add permission check based on user's hcode/role
    query = """
        SELECT 
            dr.id, dr.dispense_record_number, dr.dispense_date, dr.dispenser_id,
            u.full_name as dispenser_name, 
            dr.dispense_type, dr.remarks, dr.hcode
        FROM dispense_records dr
        JOIN users u ON dr.dispenser_id = u.id
        WHERE dr.id = %s
    """
    record = db_execute_query(query, (record_id,), fetchone=True)
    if not record:
        return jsonify({"error": "ไม่พบเอกสารการตัดจ่ายยา"}), 404
    record['dispense_date_thai'] = iso_to_thai_date(record['dispense_date'])
    return jsonify(record)

@app.route('/api/dispense_records/<int:record_id>/items', methods=['GET'])
def get_dispense_record_items(record_id):
    # TODO: Add permission check
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
            di.quantity_dispensed
        FROM dispense_items di
        JOIN medicines m ON di.medicine_id = m.id 
        WHERE di.dispense_record_id = %s AND m.hcode = %s 
        ORDER BY m.generic_name;
    """ # Ensure medicine is joined based on the hcode of the dispense record
    items = db_execute_query(query, (record_id, dispense_hcode), fetchall=True)

    if items is None:
        return jsonify({"error": "ไม่สามารถดึงรายการยาของเอกสารตัดจ่ายนี้ได้"}), 500
    
    for item in items:
        item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
    return jsonify(items)

@app.route('/api/dispense_records/<int:record_id>', methods=['PUT'])
def update_dispense_record(record_id):
    # TODO: Add role & hcode permission check
    data = request.get_json()
    if not data:
        return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400

    dispense_record = db_execute_query("SELECT id, hcode FROM dispense_records WHERE id = %s", (record_id,), fetchone=True)
    if not dispense_record:
        return jsonify({"error": "ไม่พบเอกสารตัดจ่าย"}), 404
    
    # For now, only allow updating header info, not items.
    # Item changes would require complex stock reversal logic.
    new_dispense_date_iso = thai_to_iso_date(data.get('dispense_date'))
    new_remarks = data.get('remarks')
    new_dispense_type = data.get('dispense_type')

    update_fields = []
    params = []
    if new_dispense_date_iso:
        update_fields.append("dispense_date = %s")
        params.append(new_dispense_date_iso)
    if new_remarks is not None: # Allow empty string for remarks
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


@app.route('/api/dispense_records/<int:record_id>', methods=['DELETE'])
def delete_dispense_record(record_id):
    # TODO: Add role & hcode permission check
    cancelling_user_id = request.args.get('user_id_context', type=int) # Get user ID from query param for logging
    if not cancelling_user_id:
        return jsonify({"error": "ไม่สามารถระบุผู้ดำเนินการได้"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()

        dispense_record = db_execute_query("SELECT id, hcode, dispense_record_number FROM dispense_records WHERE id = %s", (record_id,), fetchone=True, cursor_to_use=cursor)
        if not dispense_record:
            conn.rollback()
            return jsonify({"error": "ไม่พบเอกสารตัดจ่าย"}), 404
        
        dispense_hcode = dispense_record['hcode']
        dispense_ref_number = dispense_record['dispense_record_number'] or f"DSP-DEL-{record_id}"

        # 1. Get items that were dispensed
        dispensed_items = db_execute_query("SELECT medicine_id, lot_number, expiry_date, quantity_dispensed FROM dispense_items WHERE dispense_record_id = %s", (record_id,), fetchall=True, cursor_to_use=cursor)
        if dispensed_items is None: # Should not happen if record exists, but good check
            conn.rollback()
            return jsonify({"error": "ไม่พบรายการยาในเอกสารตัดจ่ายนี้"}), 500

        # 2. For each item, adjust inventory and create a reversal transaction
        for item in dispensed_items:
            medicine_id = item['medicine_id']
            lot_number = item['lot_number']
            expiry_date_iso = str(item['expiry_date']) # Already ISO from DB
            quantity_to_add_back = item['quantity_dispensed']

            total_stock_before_reversal = get_total_medicine_stock(dispense_hcode, medicine_id, cursor)
            
            # Add stock back to inventory
            # First check if the lot exists, if not, it might need to be re-created or handled
            inv_item = db_execute_query("SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (dispense_hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)
            if inv_item:
                db_execute_query("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s", (quantity_to_add_back, inv_item['id']), commit=False, cursor_to_use=cursor)
            else:
                # Lot doesn't exist, might mean it was fully depleted. Re-create it.
                # This assumes the medicine_id is still valid for the hcode.
                db_execute_query("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, CURDATE())", 
                                 (dispense_hcode, medicine_id, lot_number, expiry_date_iso, quantity_to_add_back), commit=False, cursor_to_use=cursor)

            total_stock_after_reversal = get_total_medicine_stock(dispense_hcode, medicine_id, cursor)

            db_execute_query(
                """INSERT INTO inventory_transactions 
                   (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, 
                    quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (dispense_hcode, medicine_id, lot_number, expiry_date_iso, 
                 'ยกเลิกการจ่ายยา', quantity_to_add_back, # Positive change
                 total_stock_before_reversal, total_stock_after_reversal, 
                 dispense_ref_number, 
                 cancelling_user_id, 
                 f"ยกเลิกเอกสารตัดจ่าย ID {record_id}"),
                commit=False, cursor_to_use=cursor
            )
        
        # 3. Mark dispense_record as 'ยกเลิก' (soft delete) or delete items and record
        # Soft delete is safer for audit.
        db_execute_query("UPDATE dispense_records SET status = 'ยกเลิก', updated_at = NOW() WHERE id = %s", (record_id,), commit=False, cursor_to_use=cursor)
        # Or, to hard delete:
        # db_execute_query("DELETE FROM dispense_items WHERE dispense_record_id = %s", (record_id,), commit=False, cursor_to_use=cursor)
        # db_execute_query("DELETE FROM dispense_records WHERE id = %s", (record_id,), commit=False, cursor_to_use=cursor)

        conn.commit()
        return jsonify({"message": f"ยกเลิกเอกสารตัดจ่าย ID {record_id} และปรับปรุงสต็อกแล้ว"})
    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

# == Goods Received ==
@app.route('/api/goods_received', methods=['POST'])
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
            
            # Get total stock BEFORE this item's transaction
            total_stock_before_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)

            inventory_item = db_execute_query("SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (hcode, medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)
            if inventory_item:
                inventory_id = inventory_item['id']
                cursor.execute("UPDATE inventory SET quantity_on_hand = quantity_on_hand + %s WHERE id = %s", (quantity_received, inventory_id))
            else:
                cursor.execute("INSERT INTO inventory (hcode, medicine_id, lot_number, expiry_date, quantity_on_hand, received_date) VALUES (%s, %s, %s, %s, %s, %s)", (hcode, medicine_id, lot_number, expiry_date_iso, quantity_received, received_date_iso))
            
            # Get total stock AFTER this item's transaction
            total_stock_after_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)
            
            transaction_type = 'รับเข้า-ใบเบิก' if data.get('requisition_id') else 'รับเข้า-ตรง'
            cursor.execute("INSERT INTO inventory_transactions (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", (hcode, medicine_id, lot_number, expiry_date_iso, transaction_type, quantity_received, total_stock_before_item_txn, total_stock_after_item_txn, voucher_number or f"RECV{voucher_id}", receiver_id, item.get('notes', "รับยาเข้าคลัง")))
        
        if data.get('requisition_id'):
            db_execute_query("UPDATE requisitions SET status = 'รับยาแล้ว', updated_at = NOW() WHERE id = %s AND (status = 'อนุมัติแล้ว' OR status = 'อนุมัติบางส่วน')", (data.get('requisition_id'),), commit=False, cursor_to_use=cursor)
        
        conn.commit()
        return jsonify({"message": "บันทึกการรับยาเข้าคลังสำเร็จ", "voucher_id": voucher_id, "voucher_number": voucher_number}), 201
    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.route('/api/goods_received_vouchers', methods=['GET'])
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

@app.route('/api/goods_received_vouchers/<int:voucher_id>', methods=['GET'])
def get_single_goods_received_voucher(voucher_id):
    user_hcode_context = request.args.get('hcode_context') # For permission check
    query = "SELECT grv.id, grv.voucher_number, grv.received_date, grv.receiver_id, u.full_name as receiver_name, grv.supplier_name, grv.invoice_number, grv.remarks, grv.hcode, grv.requisition_id FROM goods_received_vouchers grv JOIN users u ON grv.receiver_id = u.id WHERE grv.id = %s"
    voucher = db_execute_query(query, (voucher_id,), fetchone=True)
    if not voucher: return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
    # TODO: Implement proper role-based access control here
    # if user_hcode_context and voucher['hcode'] != user_hcode_context: # and user_role != 'ผู้ดูแลระบบ'
    #     return jsonify({"error": "ไม่มีสิทธิ์เข้าถึงเอกสารนี้"}), 403
    voucher['received_date_thai'] = iso_to_thai_date(voucher['received_date'])
    return jsonify(voucher)

@app.route('/api/goods_received_vouchers/<int:voucher_id>/items', methods=['GET'])
def get_goods_received_voucher_items(voucher_id):
    query = "SELECT gri.id as goods_received_item_id, m.id as medicine_id, m.medicine_code, m.generic_name, m.strength, m.unit, gri.lot_number, gri.expiry_date, gri.quantity_received, gri.unit_price, gri.notes FROM goods_received_items gri JOIN medicines m ON gri.medicine_id = m.id WHERE gri.goods_received_voucher_id = %s ORDER BY m.generic_name;"
    items = db_execute_query(query, (voucher_id,), fetchall=True)
    if items is None: return jsonify({"error": "ไม่สามารถดึงรายการยาของเอกสารรับนี้ได้"}), 500
    for item in items:
        item['expiry_date_original_iso'] = str(item['expiry_date']) 
        item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
    return jsonify(items)

@app.route('/api/goods_received_vouchers/<int:voucher_id>', methods=['PUT'])
def update_manual_goods_received_voucher(voucher_id):
    data = request.get_json()
    user_hcode_context = data.get('hcode_context') # hcode of the user making the request
    # TODO: Add role check (e.g., only admin or user from the voucher's hcode can edit)

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

@app.route('/api/goods_received_vouchers/<int:voucher_id>', methods=['DELETE'])
def delete_manual_goods_received_voucher(voucher_id):
    user_hcode_context = request.args.get('hcode_context') # hcode of the user making the request
    user_id_context = request.args.get('user_id_context') # ID of the user making the request
    # TODO: Add proper role check

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        voucher = db_execute_query("SELECT id, hcode, requisition_id, voucher_number FROM goods_received_vouchers WHERE id = %s", (voucher_id,), fetchone=True, cursor_to_use=cursor)
        if not voucher:
            conn.rollback()
            return jsonify({"error": "ไม่พบเอกสารการรับยา"}), 404
        
        if voucher['requisition_id'] is not None:
            conn.rollback()
            return jsonify({"error": "ไม่สามารถลบเอกสารรับยาที่อ้างอิงใบเบิกผ่านหน้านี้ได้"}), 403

        # Permission check (simplified)
        if user_hcode_context and voucher['hcode'] != user_hcode_context:
             conn.rollback()
             return jsonify({"error": "คุณไม่มีสิทธิ์ลบเอกสารนี้"}), 403

        # 1. Get items to be "un-received"
        received_items = db_execute_query("SELECT medicine_id, lot_number, expiry_date, quantity_received FROM goods_received_items WHERE goods_received_voucher_id = %s", (voucher_id,), fetchall=True, cursor_to_use=cursor)
        
        if received_items is None: # Should not happen if voucher exists, but good check
            conn.rollback()
            return jsonify({"error": "ไม่พบรายการยาในเอกสารรับนี้"}), 500

        # 2. For each item, adjust inventory and create a reversal transaction
        for item in received_items:
            medicine_id = item['medicine_id']
            lot_number = item['lot_number']
            expiry_date_iso = str(item['expiry_date']) # Already ISO from DB
            quantity_to_reverse = item['quantity_received']

            inv_item = db_execute_query("SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s", (voucher['hcode'], medicine_id, lot_number, expiry_date_iso), fetchone=True, cursor_to_use=cursor)
            
            if inv_item:
                quantity_before = inv_item['quantity_on_hand']
                quantity_after = quantity_before - quantity_to_reverse 
                # Allow stock to go negative, or add check: if quantity_after < 0, handle error or set to 0
                
                db_execute_query("UPDATE inventory SET quantity_on_hand = %s WHERE id = %s", (quantity_after, inv_item['id']), commit=False, cursor_to_use=cursor)
                
                db_execute_query(
                    """INSERT INTO inventory_transactions 
                       (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, 
                        quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks) 
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (voucher['hcode'], medicine_id, lot_number, expiry_date_iso, 
                     'ยกเลิกการรับยา (กรอกเอง)', -quantity_to_reverse, 
                     quantity_before, quantity_after, 
                     voucher['voucher_number'] or f"GRV-DEL-{voucher_id}", 
                     user_id_context or 0, # Placeholder for actual user ID initiating delete
                     f"ลบเอกสารรับยา ID {voucher_id}"),
                    commit=False, cursor_to_use=cursor
                )
            else:
                # This case should ideally not happen if data is consistent. Log it.
                print(f"Warning: Inventory record not found for hcode {voucher['hcode']}, med_id {medicine_id}, lot {lot_number}, exp {expiry_date_iso} during GRN delete.")
                # Optionally, create a negative inventory record if strict reversal is needed
                # For now, we skip if the inventory lot doesn't exist (meaning it was already gone or never properly created)


        # 3. Delete items and then the voucher
        db_execute_query("DELETE FROM goods_received_items WHERE goods_received_voucher_id = %s", (voucher_id,), commit=False, cursor_to_use=cursor)
        db_execute_query("DELETE FROM goods_received_vouchers WHERE id = %s", (voucher_id,), commit=False, cursor_to_use=cursor)
        
        conn.commit()
        return jsonify({"message": f"ลบเอกสารรับยา (กรอกเอง) ID {voucher_id} และปรับปรุงสต็อกแล้ว"})
    except Error as e:
        if conn: conn.rollback()
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@app.route('/api/requisitions', methods=['GET'])
def get_requisitions():
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')
    user_hcode = request.args.get('hcode') 
    user_role = request.args.get('role') 
    
    query = """
        SELECT 
            r.id, 
            r.requisition_number, 
            r.requisition_date, 
            u_requester.full_name as requester_name, 
            us.name as requester_hospital_name, 
            r.requester_hcode,
            r.status,
            r.approval_date,      -- <<<### ADDED THIS LINE ###>>>
            u_approver.full_name as approved_by_name -- <<<### ADDED THIS LINE ###>>>
        FROM requisitions r
        JOIN users u_requester ON r.requester_id = u_requester.id
        LEFT JOIN unitservice us ON r.requester_hcode = us.hcode
        LEFT JOIN users u_approver ON r.approved_by_id = u_approver.id -- <<<### ADDED THIS JOIN ###>>>
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
        req_item['approval_date'] = iso_to_thai_date(req_item.get('approval_date')) # <<<### ADDED THIS LINE ###>>>
    return jsonify(requisitions_data)

@app.route('/api/requisitions/<int:requisition_id>', methods=['GET'])
def get_single_requisition(requisition_id):
    query = """
        SELECT 
            r.id, r.requisition_number, r.requisition_date, 
            r.requester_id, u_requester.full_name as requester_name, 
            r.requester_hcode, us.name as requester_hospital_name,
            r.status, r.remarks,
            r.approved_by_id, u_approver.full_name as approved_by_name, 
            r.approver_hcode, 
            r.approval_date
        FROM requisitions r
        JOIN users u_requester ON r.requester_id = u_requester.id
        LEFT JOIN unitservice us ON r.requester_hcode = us.hcode
        LEFT JOIN users u_approver ON r.approved_by_id = u_approver.id 
        WHERE r.id = %s
    """
    requisition_data = db_execute_query(query, (requisition_id,), fetchone=True)

    if not requisition_data:
        return jsonify({"error": "ไม่พบใบเบิก"}), 404
    
    # Format dates before sending
    requisition_data['requisition_date_thai'] = iso_to_thai_date(requisition_data.get('requisition_date'))
    requisition_data['approval_date_thai'] = iso_to_thai_date(requisition_data.get('approval_date'))
    
    return jsonify(requisition_data)

@app.route('/api/requisitions/pending_approval', methods=['GET'])
def get_pending_approval_requisitions():
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

@app.route('/api/requisitions/<int:requisition_id>/items', methods=['GET'])
def get_requisition_items(requisition_id):
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
            ri.quantity_requested,
            ri.quantity_approved,
            ri.approved_lot_number,
            ri.approved_expiry_date,
            ri.item_approval_status,
            ri.reason_for_change_or_rejection
        FROM requisition_items ri
        JOIN medicines m ON ri.medicine_id = m.id 
        WHERE ri.requisition_id = %s AND m.hcode = %s 
        ORDER BY m.generic_name;
    """
    items = db_execute_query(query, (requisition_id, requester_hcode_for_meds), fetchall=True)

    if items is None:
        return jsonify({"error": "ไม่สามารถดึงรายการยาในใบเบิกได้"}), 500
    
    for item in items:
        item['approved_expiry_date'] = iso_to_thai_date(item.get('approved_expiry_date'))
        
    return jsonify(items)

# NEW ENDPOINT: Cancel a Requisition
@app.route('/api/requisitions/<int:requisition_id>/cancel', methods=['PUT'])
def cancel_requisition_endpoint(requisition_id):
    # TODO: Implement proper authentication and authorization
    # For example, get user_id and hcode from JWT token or session
    # For now, assume we might get it from request body or args for simulation
    data = request.get_json()
    cancelling_user_id = data.get('user_id') if data else request.args.get('user_id', type=int)
    # user_role = data.get('user_role') if data else request.args.get('user_role')
    # user_hcode = data.get('user_hcode') if data else request.args.get('user_hcode')

    if not cancelling_user_id:
        return jsonify({"error": "ไม่สามารถระบุผู้ดำเนินการยกเลิกได้"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()
        
        # 1. Fetch the requisition to check its status and owner
        requisition = db_execute_query("SELECT id, requester_id, requester_hcode, status FROM requisitions WHERE id = %s", (requisition_id,), fetchone=True, cursor_to_use=cursor)
        if not requisition:
            conn.rollback()
            return jsonify({"error": "ไม่พบใบเบิกที่ต้องการยกเลิก"}), 404

        # 2. Permission Check (Simplified for now)
        # In a real app, check if cancelling_user_id is the requester_id OR if user has admin/appropriate role
        # Also check hcode match if user is not a global admin
        # For example:
        # if requisition['requester_id'] != cancelling_user_id and user_role != 'ผู้ดูแลระบบ':
        #     conn.rollback()
        #     return jsonify({"error": "คุณไม่มีสิทธิ์ยกเลิกใบเบิกนี้"}), 403
        
        # 3. Check if the requisition can be cancelled
        if requisition['status'] != 'รออนุมัติ':
            conn.rollback()
            return jsonify({"error": f"ไม่สามารถยกเลิกใบเบิกได้ เนื่องจากสถานะปัจจุบันคือ '{requisition['status']}'"}), 400

        # 4. Update the status to 'ยกเลิก'
        db_execute_query("UPDATE requisitions SET status = 'ยกเลิก', updated_at = NOW() WHERE id = %s", (requisition_id,), commit=False, cursor_to_use=cursor)
        
        # 5. (Optional) Add to an audit log or inventory_transactions if needed
        # For simple cancellation of a pending requisition, often just updating status is enough.
        # If stock was "reserved" upon creation, that reservation would need to be released here.
        # Our current model doesn't explicitly reserve, so this step might not be needed.

        conn.commit()
        return jsonify({"message": f"ใบเบิกเลขที่ ID {requisition_id} ถูกยกเลิกสำเร็จ"}), 200

    except Error as e:
        if conn: conn.rollback()
        print(f"Database error during requisition cancellation: {e}")
        return jsonify({"error": f"เกิดข้อผิดพลาดในการยกเลิกใบเบิก: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        print(f"General error during requisition cancellation: {ex}")
        return jsonify({"error": f"เกิดข้อผิดพลาดทั่วไป: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
        
# NEW ENDPOINT: Process Requisition Approval
@app.route('/api/requisitions/<int:requisition_id>/process_approval', methods=['PUT'])
def process_requisition_approval(requisition_id):
    data = request.get_json()
    if not data or not all(k in data for k in ['approved_by_id', 'items']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (ต้องการ approved_by_id, items)"}), 400

    approved_by_id = data['approved_by_id']
    approver_hcode = data.get('approver_hcode') # Hcode of the approving unit (Main Hospital)
    approval_items_data = data['items']

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        conn.start_transaction()

        # 1. Fetch the requisition to check its current status
        requisition_header = db_execute_query("SELECT id, status FROM requisitions WHERE id = %s", (requisition_id,), fetchone=True, cursor_to_use=cursor)
        if not requisition_header:
            conn.rollback()
            return jsonify({"error": "ไม่พบใบเบิก"}), 404
        if requisition_header['status'] != 'รออนุมัติ':
            conn.rollback()
            return jsonify({"error": f"ใบเบิกนี้ไม่อยู่ในสถานะ 'รออนุมัติ' (สถานะปัจจุบัน: {requisition_header['status']})"}), 400

        # 2. Update each requisition item
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

            original_req_item = db_execute_query("SELECT quantity_requested FROM requisition_items WHERE id = %s AND requisition_id = %s", (req_item_id, requisition_id), fetchone=True, cursor_to_use=cursor)
            if not original_req_item:
                conn.rollback()
                return jsonify({"error": f"ไม่พบรายการยา ID {req_item_id} ในใบเบิกนี้"}), 404

            if item_status == 'อนุมัติ' or item_status == 'แก้ไขจำนวน':
                any_item_approved = True
                all_items_rejected = False
                if int(qty_approved) != original_req_item['quantity_requested']:
                    all_items_approved_as_requested = False
            elif item_status == 'ปฏิเสธ':
                all_items_approved_as_requested = False # If one is rejected, not all are approved as requested
            else: # Unknown status
                conn.rollback()
                return jsonify({"error": f"สถานะการอนุมัติรายการยาไม่ถูกต้อง: {item_status}"}), 400


            sql_update_item = """
                UPDATE requisition_items 
                SET 
                    quantity_approved = %s, 
                    approved_lot_number = %s, 
                    approved_expiry_date = %s, 
                    item_approval_status = %s, 
                    reason_for_change_or_rejection = %s
                WHERE id = %s
            """
            approved_exp_date_iso = thai_to_iso_date(item_data.get('approved_expiry_date'))
            cursor.execute(sql_update_item, (
                int(qty_approved),
                item_data.get('approved_lot_number'),
                approved_exp_date_iso,
                item_status,
                item_data.get('reason_for_change_or_rejection'),
                req_item_id
            ))
        
        # 3. Determine and Update overall requisition status
        final_requisition_status = ''
        if all_items_rejected and not any_item_approved: # Check if any_item_approved is false
            final_requisition_status = 'ปฏิเสธ'
        elif all_items_approved_as_requested and any_item_approved: # Ensure at least one item was actually approved
            final_requisition_status = 'อนุมัติแล้ว'
        elif any_item_approved: # Some items approved, possibly with changes or some rejections
            final_requisition_status = 'อนุมัติบางส่วน'
        else: # Should not happen if validation is correct, but as a fallback
            final_requisition_status = 'ปฏิเสธ' # Or some other error status

        sql_update_requisition_header = """
            UPDATE requisitions 
            SET status = %s, approved_by_id = %s, approver_hcode = %s, approval_date = CURDATE(), updated_at = NOW()
            WHERE id = %s
        """
        cursor.execute(sql_update_requisition_header, (
            final_requisition_status,
            approved_by_id,
            approver_hcode,
            requisition_id
        ))

        conn.commit()
        return jsonify({"message": f"ดำเนินการใบเบิก ID {requisition_id} สำเร็จ สถานะใหม่คือ {final_requisition_status}"}), 200

    except Error as e:
        if conn: conn.rollback()
        print(f"Database error during requisition approval: {e}")
        return jsonify({"error": f"เกิดข้อผิดพลาดในการดำเนินการใบเบิก: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        print(f"General error during requisition approval: {ex}")
        return jsonify({"error": f"เกิดข้อผิดพลาดทั่วไป: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.route('/api/requisitions', methods=['POST'])
def create_requisition():
    data = request.get_json()
    if not data or not all(k in data for k in ['requisition_date', 'requester_id', 'requester_hcode', 'items']) or not data.get('items'): # Check items is not empty
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
        # Ensure hcode is part of the uniqueness for requisition_number generation if needed, or make it global
        cursor.execute("SELECT requisition_number FROM requisitions WHERE requisition_number LIKE %s ORDER BY id DESC LIMIT 1", (f"REQ-{current_date_str}-%",))
        last_req = cursor.fetchone()
        next_seq = 1
        if last_req:
            try: 
                next_seq = int(last_req['requisition_number'].split('-')[-1]) + 1
            except (IndexError, ValueError): 
                pass 

        requisition_number = f"REQ-{current_date_str}-{next_seq:04d}"

        sql_requisition = """
            INSERT INTO requisitions (requisition_number, requisition_date, requester_id, requester_hcode, status, remarks)
            VALUES (%s, %s, %s, %s, %s, %s) 
        """ 
        cursor.execute(sql_requisition, (
            requisition_number, requisition_date_iso, requester_id, requester_hcode,
            'รออนุมัติ', data.get('remarks', '')
        ))
        requisition_id = cursor.lastrowid

        sql_requisition_item = """
            INSERT INTO requisition_items (requisition_id, medicine_id, quantity_requested)
            VALUES (%s, %s, %s)
        """
        for item in data['items']:
            if not item.get('medicine_id') or not item.get('quantity_requested'):
                conn.rollback()
                return jsonify({"error": "ข้อมูลรายการยาในใบเบิกไม่ครบถ้วน"}), 400

            # Verify medicine_id exists for the requester_hcode
            med_check = db_execute_query("SELECT id FROM medicines WHERE id = %s AND hcode = %s", 
                                         (item['medicine_id'], requester_hcode), 
                                         fetchone=True, 
                                         cursor_to_use=cursor)
            if not med_check:
                conn.rollback()
                return jsonify({"error": f"ไม่พบรหัสยา {item['medicine_id']} สำหรับหน่วยบริการ {requester_hcode} ของผู้ขอเบิก"}), 400

            cursor.execute(sql_requisition_item, (requisition_id, item['medicine_id'], item['quantity_requested']))

        conn.commit()
        return jsonify({
            "message": "สร้างใบเบิกยาสำเร็จ", 
            "requisition_id": requisition_id,
            "requisition_number": requisition_number
        }), 201
    except Error as e:
        if conn: conn.rollback()
        print(f"Database error during requisition creation: {e}")
        return jsonify({"error": f"Database error: {e}"}), 500
    except Exception as ex:
        if conn: conn.rollback()
        print(f"General error during requisition creation: {ex}")
        return jsonify({"error": f"General error: {ex}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.route('/api/dashboard/summary', methods=['GET'])
def get_dashboard_summary():
    user_hcode = request.args.get('hcode')
    user_role = request.args.get('role') # Role ของผู้ใช้ที่ login

    if not user_hcode and user_role != 'ผู้ดูแลระบบ':
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    summary_data = {
        "total_medicines_in_stock": 0,
        "low_stock_medicines": 0,
        "pending_requisitions": 0
    }

    try:
        # 1. Total unique medicines in stock (quantity > 0)
        #    นับจำนวนรายการยาที่ไม่ซ้ำกันซึ่งมีปริมาณคงเหลือมากกว่า 0 สำหรับ hcode ที่กำหนด
        #    และยาเหล่านั้นต้อง active อยู่ในตาราง medicines
        query_total_medicines = """
            SELECT COUNT(DISTINCT m.id) as count
            FROM medicines m
            JOIN inventory i ON m.id = i.medicine_id
            WHERE m.is_active = TRUE AND i.quantity_on_hand > 0 AND m.hcode = %s AND i.hcode = %s;
        """
        if user_hcode:
            total_medicines_result = db_execute_query(query_total_medicines, (user_hcode, user_hcode), fetchone=True, cursor_to_use=cursor)
            if total_medicines_result:
                summary_data["total_medicines_in_stock"] = total_medicines_result['count']
        elif user_role == 'ผู้ดูแลระบบ':
            # สำหรับ Admin อาจจะแสดงผลรวมของทุก hcode หรือต้องมี logic เพิ่มเติม
            # ที่นี่จะแสดงเป็น 0 ถ้าไม่ได้ระบุ hcode และไม่ใช่ admin
            pass


        # 2. Low stock medicines
        #    นับจำนวนรายการยาที่ is_active = TRUE และ ปริมาณคงเหลือรวม (จากทุก lot) <= reorder_point
        #    สำหรับ hcode ที่กำหนด
        query_low_stock = """
            SELECT COUNT(m.id) as count
            FROM medicines m
            LEFT JOIN (
                SELECT medicine_id, hcode, SUM(quantity_on_hand) as total_quantity
                FROM inventory
                WHERE hcode = %s
                GROUP BY medicine_id, hcode
            ) AS i_sum ON m.id = i_sum.medicine_id AND m.hcode = i_sum.hcode
            WHERE m.is_active = TRUE AND m.hcode = %s AND COALESCE(i_sum.total_quantity, 0) <= m.reorder_point AND COALESCE(i_sum.total_quantity, 0) > 0;
        """
        #  เพิ่ม COALESCE(i_sum.total_quantity, 0) > 0 เพื่อไม่นับยาที่หมดแล้ว (0 ชิ้น) ว่าเป็นยาใกล้หมด
        if user_hcode:
            low_stock_result = db_execute_query(query_low_stock, (user_hcode, user_hcode), fetchone=True, cursor_to_use=cursor)
            if low_stock_result:
                summary_data["low_stock_medicines"] = low_stock_result['count']
        elif user_role == 'ผู้ดูแลระบบ':
            pass


        # 3. Pending requisitions
        #    นับจำนวนใบเบิกที่สถานะเป็น 'รออนุมัติ'
        #    ถ้าเป็น 'เจ้าหน้าที่ รพสต.' จะเห็นเฉพาะใบเบิกของ hcode ตัวเอง
        #    ถ้าเป็น 'เจ้าหน้าที่ รพ. แม่ข่าย' หรือ 'ผู้ดูแลระบบ' จะเห็นใบเบิกรออนุมัติทั้งหมด
        query_pending_requisitions_base = "SELECT COUNT(*) as count FROM requisitions WHERE status = 'รออนุมัติ'"
        params_pending_req = []

        if user_role == 'เจ้าหน้าที่ รพสต.' and user_hcode:
            query_pending_requisitions_base += " AND requester_hcode = %s"
            params_pending_req.append(user_hcode)
        # สำหรับ 'เจ้าหน้าที่ รพ. แม่ข่าย' และ 'ผู้ดูแลระบบ' ไม่ต้อง filter hcode เพิ่มเติมในส่วนนี้
        # (เพราะพวกเขาควรจะเห็นใบเบิกที่รอการอนุมัติจากทุก รพสต.)

        pending_req_result = db_execute_query(query_pending_requisitions_base, tuple(params_pending_req) if params_pending_req else None, fetchone=True, cursor_to_use=cursor)
        if pending_req_result:
            summary_data["pending_requisitions"] = pending_req_result['count']

        return jsonify(summary_data), 200

    except Error as e:
        print(f"Dashboard summary error: {e}")
        return jsonify({"error": "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป Dashboard"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@app.route('/api/dispense/upload_excel/preview', methods=['POST'])
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
        # ใช้ BytesIO เพื่ออ่านไฟล์ใน memory โดยตรง
        excel_data = pd.read_excel(BytesIO(file.read()), engine='openpyxl')
        
        required_columns = ['วันที่', 'รหัสยา', 'จำนวน']
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
            
            # --- START: แก้ไขการจัดการวันที่ ---
            dispense_date_from_excel = row['วันที่']
            dispense_date_str_for_preview = ""
            dispense_date_iso_for_logic = None

            if isinstance(dispense_date_from_excel, datetime):
                # ถ้า Pandas อ่านเป็น datetime object (มักจะเป็น ค.ศ.)
                # แปลงเป็น พ.ศ. สำหรับแสดงผล และ ISO สำหรับ backend logic
                dispense_date_str_for_preview = f"{dispense_date_from_excel.day:02d}/{dispense_date_from_excel.month:02d}/{dispense_date_from_excel.year + 543}"
                dispense_date_iso_for_logic = dispense_date_from_excel.strftime('%Y-%m-%d')
            else:
                # ถ้าเป็น string, พยายามแปลงจาก "dd/mm/yyyy" (พ.ศ.)
                dispense_date_str_for_preview = str(dispense_date_from_excel).strip()
                dispense_date_iso_for_logic = thai_to_iso_date(dispense_date_str_for_preview)
            # --- END: แก้ไขการจัดการวันที่ ---

            item_preview = {
                "row_num": row_num,
                "dispense_date_str": dispense_date_str_for_preview, # ใช้ string ที่แปลงแล้วสำหรับแสดงผล
                "dispense_date_iso": dispense_date_iso_for_logic,    # ใช้ ISO สำหรับการตรวจสอบ
                "medicine_code": str(row['รหัสยา']).strip(),
                "quantity_requested_str": str(row['จำนวน']).strip(),
                "medicine_name": "N/A",
                "unit": "N/A",
                "available_lots": [],
                "status": "รอตรวจสอบ",
                "errors": []
            }
            
            # Validate dispense_date_iso (ที่แปลงแล้ว)
            if not item_preview["dispense_date_iso"]:
                item_preview["errors"].append("รูปแบบวันที่จ่ายไม่ถูกต้อง (ต้องเป็น dd/mm/yyyy พ.ศ. หรือ YYYY-MM-DD ค.ศ.)")


            # Validate quantity
            try:
                item_preview["quantity_requested"] = int(item_preview["quantity_requested_str"])
                if item_preview["quantity_requested"] <= 0:
                    item_preview["errors"].append("จำนวนต้องมากกว่า 0")
            except ValueError:
                item_preview["errors"].append("จำนวนต้องเป็นตัวเลข")

            # Fetch medicine info and available lots
            if not item_preview["errors"]:
                medicine_info = db_execute_query(
                    "SELECT id, generic_name, strength, unit FROM medicines WHERE medicine_code = %s AND hcode = %s AND is_active = TRUE",
                    (item_preview["medicine_code"], hcode), fetchone=True, cursor_to_use=cursor
                )
                if medicine_info:
                    item_preview["medicine_id"] = medicine_info['id']
                    item_preview["medicine_name"] = f"{medicine_info['generic_name']} ({medicine_info['strength'] or 'N/A'})"
                    item_preview["unit"] = medicine_info['unit']

                    lots_query = "SELECT lot_number, expiry_date, quantity_on_hand FROM inventory WHERE medicine_id = %s AND hcode = %s AND quantity_on_hand > 0 ORDER BY expiry_date ASC, lot_number ASC;"
                    available_lots_db = db_execute_query(lots_query, (medicine_info['id'], hcode), fetchall=True, cursor_to_use=cursor)
                    if available_lots_db:
                        for lot_db in available_lots_db:
                            item_preview["available_lots"].append({
                                "lot_number": lot_db["lot_number"],
                                "expiry_date_iso": str(lot_db["expiry_date"]),
                                "expiry_date_thai": iso_to_thai_date(lot_db["expiry_date"]),
                                "quantity_on_hand": lot_db["quantity_on_hand"]
                            })
                        item_preview["status"] = "พร้อมให้เลือก Lot"
                    else:
                        item_preview["errors"].append(f"ไม่พบ Lot ที่มีในคลังสำหรับยา '{item_preview['medicine_code']}'")
                else:
                    item_preview["errors"].append(f"ไม่พบรหัสยา '{item_preview['medicine_code']}' หรือยาไม่ถูกเปิดใช้งาน สำหรับหน่วยบริการ {hcode}")
            
            if item_preview["errors"]:
                 item_preview["status"] = "มีข้อผิดพลาด"

            preview_items.append(item_preview)

        return jsonify({"preview_items": preview_items}), 200

    except Exception as e:
        # Log the full error for debugging
        app.logger.error(f"Error processing Excel preview: {str(e)}", exc_info=True)
        return jsonify({"error": f"เกิดข้อผิดพลาดในการประมวลผลไฟล์ Excel: {str(e)}"}), 500
    finally:
        if 'conn' in locals() and conn and conn.is_connected():
            if 'cursor' in locals() and cursor:
                cursor.close()
            conn.close()


@app.route('/api/dispense/process_excel_dispense', methods=['POST'])
def process_excel_dispense():
    data = request.get_json()
    if not data or not data.get('dispense_items') or not data.get('dispenser_id') or not data.get('hcode'):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วนสำหรับการยืนยันการตัดจ่าย"}), 400

    items_to_dispense = data['dispense_items']
    dispenser_id = data['dispenser_id']
    hcode = data['hcode']
    dispense_type_header = data.get('dispense_type_header', 'ผู้ป่วยนอก (Excel)')
    remarks_header = data.get('remarks_header', 'ตัดจ่ายยาจากไฟล์ Excel ที่ยืนยันแล้ว')

    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)
    
    processed_count = 0
    failed_items_details = []

    try:
        conn.start_transaction()

        # --- START: แก้ไขการจัดการ overall_dispense_date_iso ---
        overall_dispense_date_iso_str = None
        if items_to_dispense and items_to_dispense[0].get('dispense_date_iso'):
            temp_date_str = items_to_dispense[0]['dispense_date_iso']
            try:
                # Validate YYYY-MM-DD format
                datetime.strptime(temp_date_str, '%Y-%m-%d')
                overall_dispense_date_iso_str = temp_date_str
            except (ValueError, TypeError):
                app.logger.warning(f"Invalid overall_dispense_date_iso from frontend: {temp_date_str}, will use current date for record.")
                overall_dispense_date_iso_str = datetime.now().strftime('%Y-%m-%d')
        else:
            overall_dispense_date_iso_str = datetime.now().strftime('%Y-%m-%d')
        # --- END: แก้ไขการจัดการ overall_dispense_date_iso ---

        current_date_str_disp = datetime.now().strftime('%y%m%d')
        cursor.execute("SELECT dispense_record_number FROM dispense_records WHERE hcode = %s AND dispense_record_number LIKE %s ORDER BY id DESC LIMIT 1", (hcode, f"DSPEXC-{hcode}-{current_date_str_disp}-%"))
        last_disp_rec = cursor.fetchone()
        next_disp_seq = 1
        if last_disp_rec:
            try: next_disp_seq = int(last_disp_rec['dispense_record_number'].split('-')[-1]) + 1
            except (IndexError, ValueError): pass
        dispense_record_number = f"DSPEXC-{hcode}-{current_date_str_disp}-{next_disp_seq:03d}"

        sql_dispense_record = "INSERT INTO dispense_records (hcode, dispense_record_number, dispense_date, dispenser_id, remarks, dispense_type) VALUES (%s, %s, %s, %s, %s, %s)"
        cursor.execute(sql_dispense_record, (hcode, dispense_record_number, overall_dispense_date_iso_str, dispenser_id, remarks_header, dispense_type_header)) # ใช้ overall_dispense_date_iso_str ที่ตรวจสอบแล้ว
        dispense_record_id = cursor.lastrowid

        for item_data in items_to_dispense:
            medicine_id = item_data.get('medicine_id')
            lot_number = item_data.get('lot_number')
            expiry_date_iso_str = item_data.get('expiry_date_iso') # ควรเป็น YYYY-MM-DD
            quantity_dispensed = item_data.get('quantity_dispensed')
            
            # --- START: แก้ไขการจัดการ item_dispense_date_iso และ transaction_datetime_for_db ---
            item_dispense_date_iso_str_from_frontend = item_data.get('dispense_date_iso')
            final_item_dispense_date_iso = overall_dispense_date_iso_str # Default to overall

            if item_dispense_date_iso_str_from_frontend:
                try:
                    datetime.strptime(item_dispense_date_iso_str_from_frontend, '%Y-%m-%d')
                    final_item_dispense_date_iso = item_dispense_date_iso_str_from_frontend
                except (ValueError, TypeError):
                    app.logger.warning(f"Invalid item_dispense_date_iso for med_code {item_data.get('medicine_code', 'N/A')}: {item_dispense_date_iso_str_from_frontend}. Using overall record date: {overall_dispense_date_iso_str}")
            
            # สร้าง transaction_datetime โดยใช้ final_item_dispense_date_iso ที่ผ่านการตรวจสอบหรือ default
            transaction_datetime_for_db = f"{final_item_dispense_date_iso} {datetime.now().strftime('%H:%M:%S')}"
            # --- END: แก้ไขการจัดการ ---

            if not all([medicine_id, lot_number, expiry_date_iso_str, quantity_dispensed, final_item_dispense_date_iso]): # ตรวจสอบ final_item_dispense_date_iso ด้วย
                failed_items_details.append({"medicine_code": item_data.get("medicine_code", "N/A"), "error": "ข้อมูลไม่ครบถ้วน (ยา, Lot, วันหมดอายุ, จำนวน, หรือวันที่จ่าย)"})
                continue
            
            try:
                quantity_dispensed = int(quantity_dispensed)
                if quantity_dispensed <= 0:
                    failed_items_details.append({"medicine_code": item_data.get("medicine_code"), "error": "จำนวนจ่ายต้องมากกว่า 0"})
                    continue
            except ValueError:
                failed_items_details.append({"medicine_code": item_data.get("medicine_code"), "error": "จำนวนจ่ายไม่ถูกต้อง"})
                continue
            
            # ตรวจสอบ expiry_date_iso_str อีกครั้ง (ควรจะเป็น YYYY-MM-DD ที่ถูกต้อง)
            try:
                datetime.strptime(expiry_date_iso_str, '%Y-%m-%d')
            except (ValueError, TypeError):
                failed_items_details.append({"medicine_code": item_data.get("medicine_code"), "lot": lot_number, "error": f"รูปแบบวันหมดอายุ ({expiry_date_iso_str}) ของ Lot ไม่ถูกต้อง"})
                continue


            total_stock_before_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)
            inventory_item = db_execute_query(
                "SELECT id, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND lot_number = %s AND expiry_date = %s",
                (hcode, medicine_id, lot_number, expiry_date_iso_str), fetchone=True, cursor_to_use=cursor
            )

            if not inventory_item or inventory_item['quantity_on_hand'] < quantity_dispensed:
                failed_items_details.append({"medicine_code": item_data.get("medicine_code"), "lot": lot_number, "error": "สต็อกไม่เพียงพอสำหรับ Lot ที่เลือก หรือ Lot ไม่พบ"})
                continue
            
            inventory_id = inventory_item['id']
            cursor.execute("UPDATE inventory SET quantity_on_hand = quantity_on_hand - %s WHERE id = %s", (quantity_dispensed, inventory_id))
            
            total_stock_after_item_txn = get_total_medicine_stock(hcode, medicine_id, cursor)

            cursor.execute(
                "INSERT INTO dispense_items (dispense_record_id, medicine_id, lot_number, expiry_date, quantity_dispensed) VALUES (%s, %s, %s, %s, %s)",
                (dispense_record_id, medicine_id, lot_number, expiry_date_iso_str, quantity_dispensed)
            )
            cursor.execute(
                "INSERT INTO inventory_transactions (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change, quantity_before_transaction, quantity_after_transaction, reference_document_id, user_id, remarks, transaction_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (hcode, medicine_id, lot_number, expiry_date_iso_str, dispense_type_header, -quantity_dispensed, total_stock_before_item_txn, total_stock_after_item_txn, dispense_record_number, dispenser_id, f"Excel Row {item_data.get('row_num', 'N/A')}", transaction_datetime_for_db) # ใช้ transaction_datetime_for_db
            )
            processed_count += 1
        
        if failed_items_details and processed_count == 0:
            conn.rollback()
            return jsonify({"error": "การตัดจ่ายยาทุกรายการจาก Excel ล้มเหลว", "details": failed_items_details}), 400
        
        conn.commit()
        message = f"บันทึกการตัดจ่ายยาจาก Excel สำเร็จ {processed_count} รายการ."
        if failed_items_details:
            message += f" พบข้อผิดพลาด {len(failed_items_details)} รายการ."
        
        return jsonify({
            "message": message, 
            "dispense_record_id": dispense_record_id, 
            "dispense_record_number": dispense_record_number,
            "processed_count": processed_count,
            "failed_details": failed_items_details
        }), 201 if not failed_items_details else 207

    except Error as e_db:
        if conn: conn.rollback()
        app.logger.error(f"Database error during Excel dispense processing: {str(e_db)}", exc_info=True)
        return jsonify({"error": f"Database error: {str(e_db)}"}), 500
    except Exception as e_main:
        if conn: conn.rollback()
        app.logger.error(f"General error during Excel dispense processing: {str(e_main)}", exc_info=True)
        return jsonify({"error": f"General error: {str(e_main)}"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8123)
