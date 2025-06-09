import mysql.connector
from mysql.connector import Error
from config.database import DB_CONFIG

def get_db_connection():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Error connecting to MySQL database: {e}")
        return None

def db_execute_query(query, params=None, fetchone=False, fetchall=False, commit=False, get_last_id=False, cursor_to_use=None):
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
            cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params)
        if commit:
            if not is_external_cursor:
                conn.commit()
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
            print("Rolling back transaction due to error.")
            conn.rollback()
        return None
    finally:
        if not is_external_cursor:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
