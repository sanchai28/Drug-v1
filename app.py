# app.py (Final Refactored Version)
# หน้าที่หลัก: สร้าง Flask App, ลงทะเบียน Blueprints, และจัดการ Endpoints กลาง

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os
load_dotenv()
# --- Import Helpers & Blueprints ---
from helpers.database import db_execute_query, get_db_connection
from helpers.utils import iso_to_thai_date
from mysql.connector import Error

# Import Blueprints ที่สร้างขึ้น
from blueprints.medicines import medicine_bp
from blueprints.inventory import inventory_bp
from blueprints.requisitions import requisition_bp
from blueprints.receive import receive_bp
from blueprints.dispense import dispense_bp

# --- App Initialization ---

app = Flask(__name__)
CORS(app)

# --- Register Blueprints ---
# ลงทะเบียนทุก Blueprint ที่เราสร้างขึ้นกับ Flask App
# URL prefix ที่กำหนดในแต่ละ blueprint จะถูกนำมาต่อท้ายที่นี่
app.register_blueprint(medicine_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(requisition_bp)
app.register_blueprint(receive_bp)
app.register_blueprint(dispense_bp)


# --- HTML Rendering Routes ---
# ส่วนจัดการการแสดงหน้าเว็บ (ยังคงอยู่ในไฟล์หลัก)
API_BASE_URL_FOR_CLIENT = os.getenv('API_BASE_URL_FOR_CLIENT', '/api')

@app.route('/')
@app.route('/index')
def index():
    return render_template('index.html', API_BASE_URL_FROM_SERVER=API_BASE_URL_FOR_CLIENT)

@app.route('/login')
def login_page():
    return render_template('login.html', API_BASE_URL_FROM_SERVER=API_BASE_URL_FOR_CLIENT)

# --- Core API Endpoints (Login, Users, etc.) ---
# API ที่เป็นส่วนกลางของระบบ จะถูกเก็บไว้ที่นี่

@app.route('/api/login', methods=['POST'])
def login_api():
    """จัดการการเข้าสู่ระบบ"""
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน"}), 400

    username = data['username']
    password_candidate = data['password']

    query = "SELECT id, username, password_hash, full_name, role, hcode FROM users WHERE username = %s AND is_active = TRUE"
    user_data = db_execute_query(query, (username,), fetchone=True)

    if user_data and check_password_hash(user_data['password_hash'], password_candidate):
        user_info = {
            "id": user_data['id'],
            "username": user_data['username'],
            "full_name": user_data['full_name'],
            "role": user_data['role'],
            "hcode": user_data['hcode']
        }
        return jsonify({"message": "เข้าสู่ระบบสำเร็จ", "user": user_info}), 200
    else:
        return jsonify({"error": "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง"}), 401


# == Unit Services ==
@app.route('/api/unitservices', methods=['GET'])
def get_unit_services():
    query = "SELECT hcode, name, type FROM unitservice ORDER BY name"
    services = db_execute_query(query, fetchall=True)
    return jsonify(services if services else [])

@app.route('/api/unitservices', methods=['POST'])
def add_unit_service():
    data = request.get_json()
    if not data or not data.get('hcode') or not data.get('name'):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน (hcode, name)"}), 400
    
    query = "INSERT INTO unitservice (hcode, name, type) VALUES (%s, %s, %s)"
    db_execute_query(query, (data['hcode'], data['name'], data.get('type', 'รพสต.')), commit=True)
    return jsonify({"message": "เพิ่มหน่วยบริการสำเร็จ"}), 201

@app.route('/api/unitservices/<string:hcode>', methods=['PUT'])
def update_unit_service(hcode):
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "ข้อมูลชื่อหน่วยบริการ (name) ไม่ครบถ้วน"}), 400
    
    name = data['name']
    new_hcode = data.get('hcode', hcode).strip()
    service_type = data.get('type')

    if not db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True):
        return jsonify({"error": f"ไม่พบหน่วยบริการรหัสเดิม {hcode}"}), 404

    if new_hcode != hcode and db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (new_hcode,), fetchone=True):
        return jsonify({"error": f"รหัสหน่วยบริการใหม่ {new_hcode} มีอยู่แล้ว"}), 409

    update_fields, params = [], []
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

    params.append(hcode)
    query = f"UPDATE unitservice SET {', '.join(update_fields)} WHERE hcode = %s"
    
    db_execute_query(query, tuple(params), commit=True)
    return jsonify({"message": f"แก้ไขข้อมูลหน่วยบริการสำเร็จ"})


@app.route('/api/unitservices/<string:hcode>', methods=['DELETE'])
def delete_unit_service(hcode):
    if not db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True):
        return jsonify({"error": f"ไม่พบหน่วยบริการรหัส {hcode}"}), 404
    query = "DELETE FROM unitservice WHERE hcode = %s"
    db_execute_query(query, (hcode,), commit=True)
    return jsonify({"message": f"ลบหน่วยบริการ {hcode} สำเร็จ"})


# == Users ==
@app.route('/api/users', methods=['GET'])
def get_users():
    query = "SELECT u.id, u.username, u.full_name, u.role, u.hcode, us.name as hcode_name, u.is_active FROM users u LEFT JOIN unitservice us ON u.hcode = us.hcode ORDER BY u.full_name"
    users = db_execute_query(query, fetchall=True)
    return jsonify(users if users else [])

@app.route('/api/users', methods=['POST'])
def add_user():
    data = request.get_json()
    if not data or not all(k in data for k in ['username', 'password', 'full_name', 'role']):
        return jsonify({"error": "ข้อมูลไม่ครบถ้วน"}), 400
    
    if db_execute_query("SELECT id FROM users WHERE username = %s", (data['username'],), fetchone=True):
        return jsonify({"error": f"ชื่อผู้ใช้งาน '{data['username']}' มีอยู่แล้ว"}), 409

    password_hash = generate_password_hash(data['password'])
    query = "INSERT INTO users (username, password_hash, full_name, role, hcode) VALUES (%s, %s, %s, %s, %s)"
    db_execute_query(query, (data['username'], password_hash, data['full_name'], data['role'], data.get('hcode')), commit=True)
    return jsonify({"message": "เพิ่มผู้ใช้งานสำเร็จ"}), 201

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.get_json()
    if not data: return jsonify({"error": "ไม่มีข้อมูลส่งมา"}), 400

    if not db_execute_query("SELECT id FROM users WHERE id = %s", (user_id,), fetchone=True):
        return jsonify({"error": "ไม่พบผู้ใช้งาน"}), 404

    update_parts, params = [], []
    
    if (full_name := data.get('full_name')) is not None:
        update_parts.append("full_name = %s")
        params.append(full_name)
    if (role := data.get('role')) is not None:
        update_parts.append("role = %s")
        params.append(role)
    if 'hcode' in data:
        update_parts.append("hcode = %s")
        params.append(data['hcode'] if data['hcode'] else None)
    if (is_active := data.get('is_active')) is not None:
        update_parts.append("is_active = %s")
        params.append(bool(is_active))
    if new_password := data.get('password'):
        update_parts.append("password_hash = %s")
        params.append(generate_password_hash(new_password))

    if not update_parts: return jsonify({"message": "ไม่มีข้อมูลให้อัปเดต"}), 200

    params.append(user_id)
    query = f"UPDATE users SET {', '.join(update_parts)} WHERE id = %s"
    db_execute_query(query, tuple(params), commit=True)
    return jsonify({"message": "แก้ไขข้อมูลผู้ใช้งานสำเร็จ"})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    if not db_execute_query("SELECT id FROM users WHERE id = %s", (user_id,), fetchone=True):
        return jsonify({"error": f"ไม่พบผู้ใช้งาน ID {user_id}"}), 404

    try:
        db_execute_query("DELETE FROM users WHERE id = %s", (user_id,), commit=True)
        return jsonify({"message": f"ผู้ใช้งาน ID {user_id} ถูกลบแล้ว"})
    except Error as e:
        app.logger.error(f"Error deleting user {user_id}: {e}")
        return jsonify({"error": f"ไม่สามารถลบผู้ใช้งานได้เนื่องจากมีข้อมูลอ้างอิง"}), 409


# == Dashboard ==
@app.route('/api/dashboard/summary', methods=['GET'])
def get_dashboard_summary():
    user_hcode = request.args.get('hcode')
    user_role = request.args.get('role')

    if not user_hcode and user_role != 'ผู้ดูแลระบบ':
        return jsonify({"error": "กรุณาระบุ hcode ของหน่วยบริการ"}), 400

    summary = {"total_medicines_in_stock": 0, "low_stock_medicines": 0, "pending_requisitions": 0}
    
    conn = get_db_connection()
    if not conn: return jsonify({"error": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"}), 500
    cursor = conn.cursor(dictionary=True)

    try:
        if user_hcode:
            # Query for total medicines
            total_med_q = "SELECT COUNT(DISTINCT m.id) as count FROM medicines m JOIN inventory i ON m.id = i.medicine_id WHERE m.is_active = TRUE AND i.quantity_on_hand > 0 AND m.hcode = %s AND i.hcode = %s"
            total_med_res = db_execute_query(total_med_q, (user_hcode, user_hcode), fetchone=True, cursor_to_use=cursor)
            if total_med_res: summary['total_medicines_in_stock'] = total_med_res['count']

            # Query for low stock medicines
            low_stock_q = """
                SELECT COUNT(m.id) as count
                FROM medicines m
                LEFT JOIN (SELECT medicine_id, hcode, SUM(quantity_on_hand) as total FROM inventory WHERE hcode = %s GROUP BY medicine_id, hcode) as i_sum
                ON m.id = i_sum.medicine_id AND m.hcode = i_sum.hcode
                WHERE m.is_active = TRUE AND m.hcode = %s AND COALESCE(i_sum.total, 0) <= m.reorder_point AND COALESCE(i_sum.total, 0) > 0
            """
            low_stock_res = db_execute_query(low_stock_q, (user_hcode, user_hcode), fetchone=True, cursor_to_use=cursor)
            if low_stock_res: summary['low_stock_medicines'] = low_stock_res['count']

        # Query for pending requisitions
        pending_req_q = "SELECT COUNT(*) as count FROM requisitions WHERE status = 'รออนุมัติ'"
        params_pending = []
        if user_role == 'เจ้าหน้าที่ รพสต.' and user_hcode:
            pending_req_q += " AND requester_hcode = %s"
            params_pending.append(user_hcode)
        
        pending_req_res = db_execute_query(pending_req_q, tuple(params_pending) if params_pending else None, fetchone=True, cursor_to_use=cursor)
        if pending_req_res: summary['pending_requisitions'] = pending_req_res['count']

        return jsonify(summary)

    except Error as e:
        app.logger.error(f"Dashboard summary error: {e}")
        return jsonify({"error": "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป Dashboard"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# --- Main Execution ---
if __name__ == '__main__':
    # For production, use a WSGI server like Gunicorn or Waitress
    app.run(host='0.0.0.0', port=8123, debug=False)
