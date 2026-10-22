from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings

# Create your models here.
class User(AbstractUser):
    class Role(models.TextChoices):
        CLIENT = "CLIENT", "Клиент"
        UNDERWRITER = "UNDERWRITER", "Андеррайтер"
    role = models.CharField(max_length=24, choices=Role.choices, default=Role.CLIENT)

class Company(models.Model):
    class LegalForm(models.TextChoices):
        IP = "IP", "ИП"
        OOO = "OOO", "ООО"
    class TaxRegime(models.TextChoices):
        OSNO = "OSNO", "ОСНО"
        USN_INCOME = "USN_INCOME", "УСН «Доходы»"
        USN_INCOME_EXPENSES = "USN_INCOME_EXPENSES", "УСН «Доходы минус расходы»"
        PSN = "PSN", "Патент (только ИП)"
        ESHN = "ESHN", "ЕСХН"
        AUSN = "AUSN", "АУСН"

    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="company")
    inn = models.CharField(max_length=12, unique=True)
    ogrn = models.CharField(max_length=15)
    name = models.CharField(max_length=255)
    legal_form = models.CharField(max_length=3, choices=LegalForm.choices)
    tax_regime = models.CharField(max_length=32, choices=TaxRegime.choices, default=TaxRegime.OSNO)
    registered_at = models.DateField()