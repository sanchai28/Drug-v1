from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash
from utils.db_helpers import db_execute_query

auth_bp = Blueprint('auth_bp', __name__, url_prefix='/api')

@auth_bp.route('/login', methods=['POST'])
def login_api():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน"}), 400

    username = data['username']
    password_candidate = data['password']

    query = "SELECT id, username, password_hash, full_name, role, hcode FROM users WHERE username = %s AND is_active = TRUE"
    user_data = db_execute_query(query, (username,), fetchone=True)

    if user_data:
        if check_password_hash(user_data['password_hash'], password_candidate):
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
