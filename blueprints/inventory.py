from flask import Blueprint, request, jsonify, current_app
from utils.db_helpers import db_execute_query, get_db_connection
from utils.date_helpers import thai_to_iso_date, iso_to_thai_date
from utils.transaction_utils import map_dispense_type_to_inventory_transaction_type
from mysql.connector import Error
from datetime import datetime

inventory_bp = Blueprint('inventory_bp', __name__, url_prefix='/api/inventory')

def get_total_medicine_stock(hcode, medicine_id, cursor):
    stock_query = "SELECT COALESCE(SUM(quantity_on_hand), 0) as total_stock FROM inventory WHERE hcode = %s AND medicine_id = %s"
    stock_data = db_execute_query(stock_query, (hcode, medicine_id), fetchone=True, cursor_to_use=cursor)
    return stock_data['total_stock'] if stock_data else 0

def _dispense_medicine_fefo(hcode, medicine_id, quantity_to_dispense, dispense_record_id, dispenser_id, dispense_record_number, hos_guid, dispense_type_from_record, item_dispense_date_iso, cursor):
    remaining_qty_to_dispense = quantity_to_dispense
    available_lots_query = "SELECT id as inventory_id, lot_number, expiry_date, quantity_on_hand FROM inventory WHERE hcode = %s AND medicine_id = %s AND quantity_on_hand > 0 ORDER BY expiry_date ASC, id ASC"
    available_lots = db_execute_query(available_lots_query, (hcode, medicine_id), fetchall=True, cursor_to_use=cursor)

    if not available_lots and remaining_qty_to_dispense > 0:
        current_app.logger.warning(f"FEFO: No stock available for medicine_id {medicine_id} in hcode {hcode}.")
        return False

    dispensed_from_lots_info = []
    inventory_transaction_type = map_dispense_type_to_inventory_transaction_type(dispense_type_from_record)

    for lot in available_lots:
        if remaining_qty_to_dispense <= 0: break

        inventory_id = lot['inventory_id']
        lot_number = lot['lot_number']
        expiry_date_iso_lot = str(lot['expiry_date'])
        qty_in_lot = lot['quantity_on_hand']
        qty_to_take_from_this_lot = min(remaining_qty_to_dispense, qty_in_lot)

        dispensed_from_lots_info.append({
            'lot_number': lot_number,
            'expiry_date_iso': expiry_date_iso_lot,
            'quantity_dispensed_from_lot': qty_to_take_from_this_lot
        })

        new_qty_in_lot = qty_in_lot - qty_to_take_from_this_lot
        db_execute_query("UPDATE inventory SET quantity_on_hand = %s WHERE id = %s",
                         (new_qty_in_lot, inventory_id), commit=False, cursor_to_use=cursor)

        transaction_datetime_for_db = f"{item_dispense_date_iso} {datetime.now().strftime('%H:%M:%S')}"
        current_total_stock_before_this_lot_op = get_total_medicine_stock(hcode, medicine_id, cursor) + qty_to_take_from_this_lot
        current_total_stock_after_this_lot_op = get_total_medicine_stock(hcode, medicine_id, cursor)

        db_execute_query(
            """INSERT INTO inventory_transactions
               (hcode, medicine_id, lot_number, expiry_date, transaction_type, quantity_change,
                quantity_before_transaction, quantity_after_transaction, reference_document_id, external_reference_guid, user_id, remarks, transaction_date)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (hcode, medicine_id, lot_number, expiry_date_iso_lot,
             inventory_transaction_type, -qty_to_take_from_this_lot,
             current_total_stock_before_this_lot_op, current_total_stock_after_this_lot_op,
             dispense_record_number, hos_guid, dispenser_id,
             f"FEFO Dispense (Lot: {lot_number})", transaction_datetime_for_db),
            commit=False, cursor_to_use=cursor
        )
        remaining_qty_to_dispense -= qty_to_take_from_this_lot

    if remaining_qty_to_dispense > 0:
        current_app.logger.warning(f"FEFO: Insufficient stock for medicine_id {medicine_id}. Needed {quantity_to_dispense}, only {quantity_to_dispense - remaining_qty_to_dispense} available/dispensed.")
        return False

    for lot_info in dispensed_from_lots_info:
        db_execute_query(
            "INSERT INTO dispense_items (dispense_record_id, medicine_id, lot_number, expiry_date, quantity_dispensed, hos_guid, item_status) VALUES (%s, %s, %s, %s, %s, %s, 'ปกติ')",
            (dispense_record_id, medicine_id, lot_info['lot_number'], lot_info['expiry_date_iso'], lot_info['quantity_dispensed_from_lot'], hos_guid),
            commit=False, cursor_to_use=cursor
        )
    return True

@inventory_bp.route('/', methods=['GET'])
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
        base_query = base_query.replace("LEFT JOIN inventory i ON m.id = i.medicine_id AND i.quantity_on_hand > 0",
                                        "LEFT JOIN inventory i ON m.id = i.medicine_id AND i.hcode = m.hcode AND i.quantity_on_hand > 0")
    if where_clauses:
        base_query += " WHERE " + " AND ".join(where_clauses)
    base_query += " GROUP BY m.id, m.medicine_code, m.generic_name, m.strength, m.unit, m.reorder_point ORDER BY m.generic_name;"
    inventory_summary = db_execute_query(base_query, tuple(params) if params else None, fetchall=True)
    if inventory_summary is None: return jsonify({"error": "ไม่สามารถดึงข้อมูลคลังยาได้"}), 500
    return jsonify(inventory_summary)

@inventory_bp.route('/history/<int:medicine_id>', methods=['GET'])
def get_inventory_history(medicine_id):
    user_hcode = request.args.get('hcode')
    start_date_thai = request.args.get('startDate')
    end_date_thai = request.args.get('endDate')

    if not user_hcode:
        return jsonify({"error": "กรุณาระบุ hcode"}), 400

    params = []
    query_conditions = []

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
            it.external_reference_guid,
            it.remarks,
            u.full_name as user_full_name
        FROM inventory_transactions it
        JOIN users u ON it.user_id = u.id
        WHERE {" AND ".join(query_conditions)}
        ORDER BY it.transaction_date ASC, it.id ASC;
    """
    try:
        history = db_execute_query(query, tuple(params), fetchall=True)
        if history is None:
            return jsonify({"error": "ไม่สามารถดึงประวัติยาได้ (DB Error)"}), 500

        for item in history:
            item['transaction_date'] = item['transaction_date'].strftime('%d/%m/%Y %H:%M:%S') if item.get('transaction_date') else '-'
            item['expiry_date'] = iso_to_thai_date(item.get('expiry_date'))
        return jsonify(history)
    except Error as e:
        current_app.logger.error(f"Caught SQL Error in route get_inventory_history: {e}")
        return jsonify({"error": f"เกิดข้อผิดพลาดในการดึงข้อมูลประวัติยา: {e}"}), 500
    except Exception as ex:
        current_app.logger.error(f"Caught General Error in route get_inventory_history: {ex}")
        return jsonify({"error": f"เกิดข้อผิดพลาดทั่วไป: {ex}"}), 500

@inventory_bp.route('/lots', methods=['GET'])
def get_medicine_lots_in_inventory():
    medicine_id_str = request.args.get('medicine_id')
    hcode = request.args.get('hcode')
    if not medicine_id_str or not hcode: return jsonify({"error": "กรุณาระบุ medicine_id และ hcode"}), 400
    try: medicine_id = int(medicine_id_str)
    except ValueError: return jsonify({"error": "medicine_id ไม่ถูกต้อง"}), 400
    query = "SELECT lot_number, expiry_date, quantity_on_hand FROM inventory WHERE medicine_id = %s AND hcode = %s AND quantity_on_hand > 0 ORDER BY expiry_date ASC, id ASC;"
    lots = db_execute_query(query, (medicine_id, hcode), fetchall=True)
    if lots is None: return jsonify({"error": "ไม่สามารถดึงข้อมูล Lot ของยาได้"}), 500
    for lot in lots:
        lot['expiry_date_iso'] = str(lot['expiry_date'])
        lot['expiry_date_thai'] = iso_to_thai_date(lot['expiry_date'])
        lot['expiry_date'] = iso_to_thai_date(lot['expiry_date'])
    return jsonify(lots)
