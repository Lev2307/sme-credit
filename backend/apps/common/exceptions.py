from rest_framework.exceptions import APIException

class Conflict(APIException):
    status_code = 409
    default_code = "conflict"
    default_detail = "Действие недоступно в текущем статусе заявки"
