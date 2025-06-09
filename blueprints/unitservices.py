from flask import Blueprint, request, jsonify
from utils.db_helpers import db_execute_query
from datetime import datetime

unitservices_bp = Blueprint('unitservices_bp', __name__, url_prefix='/api/unitservices')

@unitservices_bp.route('/', methods=['GET'])
def get_unit_services():
    query = "SELECT hcode, name, type, created_at, updated_at FROM unitservice ORDER BY name"
    unit_services = db_execute_query(query, fetchall=True)
    if unit_services is None:
        return jsonify({"error": "ไม่สามารถดึงข้อมูลหน่วยบริการได้"}), 500
    for service in unit_services:
        service['created_at'] = service['created_at'].strftime('%d/%m/%Y %H:%M:%S') if service.get('created_at') else None
        service['updated_at'] = service['updated_at'].strftime('%d/%m/%Y %H:%M:%S') if service.get('updated_at') else None
    return jsonify(unit_services)

@unitservices_bp.route('/', methods=['POST'])
def add_unit_service():
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

@unitservices_bp.route('/<string:hcode>', methods=['PUT'])
def update_unit_service(hcode):
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "ข้อมูลชื่อหน่วยบริการ (name) ไม่ครบถ้วน"}), 400

    name = data['name']
    new_hcode = data.get('hcode', hcode).strip()
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

    params.append(hcode)
    query = f"UPDATE unitservice SET {', '.join(update_fields)} WHERE hcode = %s"

    db_execute_query(query, tuple(params), commit=True)

    final_hcode_to_fetch = new_hcode if new_hcode != hcode else hcode
    updated_service = db_execute_query("SELECT hcode, name, type, created_at, updated_at FROM unitservice WHERE hcode = %s", (final_hcode_to_fetch,), fetchone=True)
    if updated_service:
        updated_service['created_at'] = updated_service['created_at'].strftime('%d/%m/%Y %H:%M:%S') if updated_service.get('created_at') else None
        updated_service['updated_at'] = updated_service['updated_at'].strftime('%d/%m/%Y %H:%M:%S') if updated_service.get('updated_at') else None
        return jsonify({"message": f"แก้ไขข้อมูลหน่วยบริการ {final_hcode_to_fetch} สำเร็จ", "unitservice": updated_service})
    return jsonify({"error": "ไม่สามารถอัปเดตข้อมูลหน่วยบริการได้"}), 500

@unitservices_bp.route('/<string:hcode>', methods=['DELETE'])
def delete_unit_service(hcode):
    if not db_execute_query("SELECT hcode FROM unitservice WHERE hcode = %s", (hcode,), fetchone=True):
        return jsonify({"error": f"ไม่พบหน่วยบริการรหัส {hcode}"}), 404
    query = "DELETE FROM unitservice WHERE hcode = %s"
    db_execute_query(query, (hcode,), commit=True)
    return jsonify({"message": f"ลบหน่วยบริการ {hcode} สำเร็จ"})
