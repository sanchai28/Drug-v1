from flask import Blueprint, request, jsonify, current_app
from utils.db_helpers import db_execute_query, get_db_connection
from mysql.connector import Error

dashboard_bp = Blueprint('dashboard_bp', __name__, url_prefix='/api/dashboard')

@dashboard_bp.route('/summary', methods=['GET'])
def get_dashboard_summary():
    user_hcode = request.args.get('hcode')
    user_role = request.args.get('role')

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
            # For admin, we might want to count across all hcodes or skip hcode filtering
            # This part needs clarification based on desired admin view
            query_total_medicines_admin = """
                SELECT COUNT(DISTINCT m.id) as count
                FROM medicines m
                JOIN inventory i ON m.id = i.medicine_id
                WHERE m.is_active = TRUE AND i.quantity_on_hand > 0;
            """
            total_medicines_result_admin = db_execute_query(query_total_medicines_admin, fetchone=True, cursor_to_use=cursor)
            if total_medicines_result_admin:
                summary_data["total_medicines_in_stock"] = total_medicines_result_admin['count']


        query_low_stock = """
            SELECT COUNT(m.id) as count
            FROM medicines m
            LEFT JOIN (
                SELECT medicine_id, hcode, SUM(quantity_on_hand) as total_quantity
                FROM inventory
                WHERE hcode = %s  /* Filter sum by hcode */
                GROUP BY medicine_id, hcode
            ) AS i_sum ON m.id = i_sum.medicine_id AND m.hcode = i_sum.hcode
            WHERE m.is_active = TRUE AND m.hcode = %s AND COALESCE(i_sum.total_quantity, 0) <= m.reorder_point AND COALESCE(i_sum.total_quantity, 0) > 0;
        """
        if user_hcode:
            low_stock_result = db_execute_query(query_low_stock, (user_hcode, user_hcode), fetchone=True, cursor_to_use=cursor)
            if low_stock_result:
                summary_data["low_stock_medicines"] = low_stock_result['count']
        elif user_role == 'ผู้ดูแลระบบ':
            # Admin view for low stock
            query_low_stock_admin = """
                SELECT COUNT(m.id) as count
                FROM medicines m
                LEFT JOIN (
                    SELECT medicine_id, hcode, SUM(quantity_on_hand) as total_quantity
                    FROM inventory
                    GROUP BY medicine_id, hcode
                ) AS i_sum ON m.id = i_sum.medicine_id AND m.hcode = i_sum.hcode
                WHERE m.is_active = TRUE AND COALESCE(i_sum.total_quantity, 0) <= m.reorder_point AND COALESCE(i_sum.total_quantity, 0) > 0;
            """
            low_stock_result_admin = db_execute_query(query_low_stock_admin, fetchone=True, cursor_to_use=cursor)
            if low_stock_result_admin:
                summary_data["low_stock_medicines"] = low_stock_result_admin['count']


        query_pending_requisitions_base = "SELECT COUNT(*) as count FROM requisitions WHERE status = 'รออนุมัติ'"
        params_pending_req = []

        if user_role == 'เจ้าหน้าที่ รพสต.' and user_hcode: # This case is fine
            query_pending_requisitions_base += " AND requester_hcode = %s"
            params_pending_req.append(user_hcode)
        # For admin, no hcode filter for pending requisitions, show all.

        pending_req_result = db_execute_query(query_pending_requisitions_base, tuple(params_pending_req) if params_pending_req else None, fetchone=True, cursor_to_use=cursor)
        if pending_req_result:
            summary_data["pending_requisitions"] = pending_req_result['count']

        return jsonify(summary_data), 200

    except Error as e:
        current_app.logger.error(f"Dashboard summary error: {e}", exc_info=True)
        return jsonify({"error": "เกิดข้อผิดพลาดในการดึงข้อมูลสรุป Dashboard"}), 500
    except Exception as ex: # Catch any other general exceptions
        current_app.logger.error(f"General dashboard summary error: {ex}", exc_info=True)
        return jsonify({"error": "เกิดข้อผิดพลาดทั่วไปในการประมวลผลข้อมูล Dashboard"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
