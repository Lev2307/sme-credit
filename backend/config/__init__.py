# Celery поднимается вместе с Django, чтобы @shared_task знали, к какому приложению относятся
from .celery import app as celery_app

__all__ = ("celery_app",)
