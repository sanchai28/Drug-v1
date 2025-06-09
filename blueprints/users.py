from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import generate_password_hash
from utils.db_helpers import db_execute_query
from mysql.connector import Error

users_bp = Blueprint('users_bp', __name__, url_prefix='/api/users')

@users_bp.route('/', methods=['GET'])
def get_users():
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

@users_bp.route('/', methods=['POST'])
def add_user():
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

    password_hash = generate_password_hash(password)

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

@users_bp.route('/<int:user_id>', methods=['PUT'])
def update_user(user_id):
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
        password_hash = generate_password_hash(new_password)
        update_parts.append("password_hash = %s")
        params.append(password_hash)

    if not update_parts:
        return jsonify({"message": "ไม่มีข้อมูลให้อัปเดต"}), 200

    query = f"UPDATE users SET {', '.join(update_parts)} WHERE id = %s"
    params.append(user_id)

    db_execute_query(query, tuple(params), commit=True)
    updated_user = db_execute_query("SELECT id, username, full_name, role, hcode, is_active FROM users WHERE id = %s", (user_id,), fetchone=True)
    return jsonify({"message": f"แก้ไขข้อมูลผู้ใช้งาน ID {user_id} สำเร็จ", "user": updated_user})

@users_bp.route('/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    user_exists = db_execute_query("SELECT id FROM users WHERE id = %s", (user_id,), fetchone=True)
    if not user_exists:
        return jsonify({"error": f"ไม่พบผู้ใช้งาน ID {user_id}"}), 404

    try:
        query = "DELETE FROM users WHERE id = %s"
        db_execute_query(query, (user_id,), commit=True)
        if not db_execute_query("SELECT id FROM users WHERE id = %s", (user_id,), fetchone=True):
            return jsonify({"message": f"ผู้ใช้งาน ID {user_id} ถูกลบออกจากระบบแล้ว (Hard Delete)"})
        else:
            return jsonify({"error": f"ไม่สามารถลบผู้ใช้งาน ID {user_id} ได้"}), 500
    except Error as e:
        current_app.logger.error(f"Error hard deleting user {user_id}: {e}")
        return jsonify({"error": f"ไม่สามารถลบผู้ใช้งานได้เนื่องจากมีข้อมูลอ้างอิง: {e}"}), 409
    except Exception as ex:
        current_app.logger.error(f"General error hard deleting user {user_id}: {ex}")
        return jsonify({"error": f"เกิดข้อผิดพลาดทั่วไปขณะลบผู้ใช้งาน: {ex}"}), 500
