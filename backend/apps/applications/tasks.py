import uuid

# таски заявок

def enqueue_processing(app_id: uuid.UUID):
    from .pipeline import process_application  # импорт внутри, чтобы не было циклического импорта
    process_application(app_id)