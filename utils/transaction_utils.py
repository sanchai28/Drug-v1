def map_dispense_type_to_inventory_transaction_type(dispense_type_from_record):
    """Maps dispense_records.dispense_type to inventory_transactions.transaction_type."""
    if dispense_type_from_record is None:
        return 'อื่นๆ' # Fallback for safety

    if dispense_type_from_record.endswith('(Excel)'):
        return 'จ่ายออก-Excel'
    elif dispense_type_from_record in ['ผู้ป่วยนอก', 'ผู้ป่วยใน', 'หน่วยงานภายใน']:
        return 'จ่ายออก-ผู้ป่วย' # Consolidate manual types for now, can be more specific if needed
    return 'อื่นๆ' # Default fallback
