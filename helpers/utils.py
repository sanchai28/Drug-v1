# /helpers/utils.py
from datetime import datetime

def thai_to_iso_date(thai_date_str):
    """แปลงวันที่รูปแบบไทย (วว/ดด/ปปปป พ.ศ.) เป็นรูปแบบ ISO (YYYY-MM-DD)"""
    if not thai_date_str: return None
    try:
        parts = thai_date_str.split('/')
        if len(parts) != 3: return None
        day, month, buddhist_year = int(parts[0]), int(parts[1]), int(parts[2])
        if buddhist_year < 2500: return None  # ตรวจสอบความสมเหตุสมผลของปี พ.ศ.
        christian_year = buddhist_year - 543
        if not (1 <= month <= 12 and 1 <= day <= 31):
             return None
        return f"{christian_year:04d}-{month:02d}-{day:02d}"
    except (ValueError, TypeError):
        return None

def iso_to_thai_date(iso_date_obj):
    """แปลงวันที่รูปแบบ ISO (string หรือ object) เป็นรูปแบบไทย (วว/ดด/ปปปป พ.ศ.)"""
    if not iso_date_obj: return None
    try:
        if isinstance(iso_date_obj, str):
            date_obj = datetime.strptime(iso_date_obj, '%Y-%m-%d').date()
        elif isinstance(iso_date_obj, datetime):
            date_obj = iso_date_obj.date()
        elif hasattr(iso_date_obj, 'year') and hasattr(iso_date_obj, 'month') and hasattr(iso_date_obj, 'day'):
            date_obj = iso_date_obj
        else:
            return None

        day = date_obj.strftime('%d')
        month = date_obj.strftime('%m')
        buddhist_year = date_obj.year + 543
        return f"{day}/{month}/{buddhist_year}"
    except (ValueError, TypeError):
        return None
