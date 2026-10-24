def enqueue_processing(app_id):
    from .pipeline import process_application  # импорт внутри, чтобы не было циклического импорта
    process_application(app_id)

def enqueue_disbursement(app_id):
    from .services import disburse
    disburse(app_id)