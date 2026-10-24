from decimal import Decimal

from django.core.management.base import BaseCommand
from django.shortcuts import get_object_or_404
from django.http import Http404

from apps.accounts.models import User
from apps.common.choices import TaxRegimeChoices as TR
from apps.common.choices import LegalFormChoices as LF
from apps.catalog.models import Product, DocumentRequirement
from apps.decisioning.params import DEFAULT_PARAMS
from apps.catalog.models import ScoringConfig

from apps.common.choices import DocTypeChoices as DT

CLIENTS = [
    {
        "username": "Reliable",
        "first_name": "Иван",
        "last_name": "Голубочкин",
        "password": "x123x",
    },
    {
        "username": "Ambitious",
        "first_name": "Павел",
        "last_name": "Дуров",
        "password": "x123x",
    },
    {
        "username": "Inaccurate",
        "first_name": "Артем",
        "last_name": "Темнов",
        "password": "x123x",
    },
        {
        "username": "Borderline",
        "first_name": "Никита",
        "last_name": "Светлов",
        "password": "x123x",
    },
    {
        "username": "Problematic",
        "first_name": "Марк",
        "last_name": "Буров",
        "password": "x123x",
    },
    {
        "username": "Capricious",
        "first_name": "Вадим",
        "last_name": "Казаков",
        "password": "x123x"
    }
]

PRODUCTS = [
    {
        "code": "EXPRESS",
        "title": "Экспресс-кредит",
        "description": (
            "Небольшая сумма на срочные нужды: закрыть кассовый разрыв, оплатить поставщику, "
            "починить оборудование. Без залога и с минимумом документов."
        ),
        "min_amount": Decimal("300000"),
        "max_amount": Decimal("3000000"),
        "max_term_months": 24,
        "base_rate": Decimal("23.00"),
        "requires_collateral": False,
        "max_ltv": None,
        "min_business_age_months": 6,
        "sort_order": 1,
    },
    {
        "code": "WORKING_CAPITAL",
        "title": "Кредит на оборотные средства",
        "description": (
            "На текущие расходы бизнеса: закупить товар или сырьё, выплатить зарплату, "
            "пережить сезонный спад. Без залога."
        ),
        "min_amount": Decimal("1000000"),
        "max_amount": Decimal("15000000"),
        "max_term_months": 36,
        "base_rate": Decimal("20.00"),
        "requires_collateral": False,
        "max_ltv": None,
        "min_business_age_months": 12,
        "sort_order": 2,
    },
    {
        "code": "INVESTMENT",
        "title": "Инвестиционный кредит",
        "description": (
            "На развитие: купить оборудование или транспорт, отремонтировать помещение. "
            "Нужен залог, им может стать то, что вы покупаете. Кредит — до 70% стоимости залога, "
            "поэтому ставка ниже."
        ),
        "min_amount": Decimal("3000000"),
        "max_amount": Decimal("50000000"),
        "max_term_months": 60,
        "base_rate": Decimal("18.00"),
        "requires_collateral": True,
        "max_ltv": Decimal("0.70"),
        "min_business_age_months": 12,
        "sort_order": 3,
    },
]

DOCUMENTS = [
    {
        "doc_type": DT.BANK_STATEMENT,
        "name": "Выписка по расчётному счёту за 12 месяцев",
        "hint": "Выгрузите в интернет-банке в PDF. Если счетов несколько, нужна выписка по основному.",
        "product": None, "legal_form": "", "tax_regime": "", "sort_order": 1,
    },
    {
        "doc_type": DT.FINANCIAL_STATEMENTS,
        "name": "Бухгалтерская отчётность за прошлый год: баланс и отчёт о финансовых результатах",
        "hint": "Есть у бухгалтера или в сервисе сдачи отчётности. Копию можно скачать на bo.nalog.ru.",
        "product": None, "legal_form": LF.OOO, "tax_regime": "", "sort_order": 2,
    },
    {
        "doc_type": DT.VAT_RETURN,
        "name": "Декларация по НДС за последний квартал",
        "hint": "Вместе с квитанцией о приёме из налоговой.",
        "product": None, "legal_form": "", "tax_regime": TR.OSNO, "sort_order": 3,
    },
    {
        "doc_type": DT.NDFL_RETURN,
        "name": "Декларация 3-НДФЛ за прошлый год",
        "hint": "Скачайте в личном кабинете ИП на nalog.gov.ru, в разделе с поданными декларациями.",
        "product": None, "legal_form": LF.IP, "tax_regime": TR.OSNO, "sort_order": 3,
    },
    {
        "doc_type": DT.USN_RETURN,
        "name": "Декларация по УСН за прошлый год",
        "hint": "С квитанцией о приёме. Если сдавали через личный кабинет на nalog.gov.ru, скачайте её там.",
        "product": None, "legal_form": "", "tax_regime": TR.USN_INCOME, "sort_order": 3,
    },
    {
        "doc_type": DT.USN_RETURN,
        "name": "Декларация по УСН за прошлый год",
        "hint": "С квитанцией о приёме. Если сдавали через личный кабинет на nalog.gov.ru, скачайте её там.",
        "product": None, "legal_form": "", "tax_regime": TR.USN_INCOME_EXPENSES, "sort_order": 3,
    },
    {
        "doc_type": DT.ESHN_RETURN,
        "name": "Декларация по ЕСХН за прошлый год",
        "hint": "С квитанцией о приёме из налоговой.",
        "product": None, "legal_form": "", "tax_regime": TR.ESHN, "sort_order": 3,
    },
    {
        "doc_type": DT.PATENT,
        "name": "Патент и книга учёта доходов за последние 12 месяцев",
        "hint": (
            "На патенте декларацию не сдают, поэтому доходы подтверждает книга учёта доходов. "
            "Подойдёт выгрузка из бухгалтерской программы или скан бумажной книги."
        ),
        "product": None, "legal_form": LF.IP, "tax_regime": TR.PSN, "sort_order": 3,
    },
    {
        "doc_type": DT.PURCHASE_CONTRACT,
        "name": "Договор, счёт или коммерческое предложение на покупку",
        "hint": "На то, что покупаете в кредит: оборудование, транспорт, ремонт. Подойдёт счёт от поставщика.",
        "product": "INVESTMENT", "legal_form": "", "tax_regime": "", "sort_order": 4,
    },
    {
        "doc_type": DT.COLLATERAL_DOCS,
        "name": "Документы на залог и отчёт об оценке",
        "hint": (
            "Для транспорта — ПТС или СТС, для недвижимости — выписка из ЕГРН, "
            "для оборудования — договор покупки. Отчёт об оценке — от независимого оценщика."
        ),
        "product": "INVESTMENT", "legal_form": "", "tax_regime": "", "sort_order": 5,
    },
]

class Command(BaseCommand):
    help = "Creates init instances: superuser, 5 client users, 1 underwriter, 3 product and connected docs"

    def handle(self, *args, **options):
        # создание конфига
        config, created = ScoringConfig.objects.get_or_create(
            version=1,
            defaults={
                "params": DEFAULT_PARAMS,
                "is_active": True,
                "comment": "Начальная версия: числа из docs/03-decision-model.md",
            }
        )

        admin, created = User.objects.get_or_create(username="admin", defaults={"is_staff": True, "is_superuser": True})
        if created:
            admin.set_password("x123x")
            admin.save()
            self.stdout.write(self.style.SUCCESS('Сущность администратора с именем "%s" успешно создана!' % admin.username))
        else:
            self.stdout.write(self.style.WARNING('Сущность администратора с именем "%s" уже была создана' % admin.username))

        underwriter, created = User.objects.get_or_create(username="underWriter", role=User.Role.UNDERWRITER)
        if created:
            underwriter.set_password("x123x")
            underwriter.save()
            self.stdout.write(self.style.SUCCESS('Сущность андеррайтера с именем "%s" успешно создана!' % underwriter.username))
        else:
            self.stdout.write(self.style.WARNING('Сущность андеррайтера с именем "%s" уже была создана' % underwriter.username))

        for client in CLIENTS:
            cl, created = User.objects.get_or_create(username=client["username"], first_name=client["first_name"], last_name=client["last_name"], role=User.Role.CLIENT)
            if created:
                cl.set_password(client["password"])
                cl.save()
                self.stdout.write(self.style.SUCCESS('Сущность клиента с именем "%s" успешно создана!' % cl.username))
            else:
                self.stdout.write(self.style.WARNING('Сущность клиента с именем "%s" уже была создана' % cl.username))


        for product in PRODUCTS:
            pr, created = Product.objects.get_or_create(
                code=product["code"],
                title=product["title"],
                description=product["description"],
                min_amount=product["min_amount"],
                max_amount=product["max_amount"],
                max_term_months=product["max_term_months"],
                base_rate=product["base_rate"],
                requires_collateral=product["requires_collateral"],
                max_ltv=product["max_ltv"],
                min_business_age_months=product["min_business_age_months"],
                sort_order=product["sort_order"],
            )
            if created:
                self.stdout.write(self.style.SUCCESS('Сущность продукта с кодом "%s" успешно создана!' % pr.code))
            else:
                self.stdout.write(self.style.WARNING('Сущность продукта с кодом "%s" уже была создана' % pr.code))

        for document in DOCUMENTS:
            prod = None
            try:
                prod = get_object_or_404(Product, code=document["product"])
            except Http404:
                pass
            doc, created = DocumentRequirement.objects.get_or_create(
                doc_type=document["doc_type"],
                name=document["name"],
                hint=document["hint"],
                product=prod,
                legal_form=document["legal_form"],
                tax_regime=document["tax_regime"],
                sort_order=document["sort_order"],
            )
            if created:
                self.stdout.write(self.style.SUCCESS('Сущность документа с названием "%s" успешно создана!' % doc.name))
            else:
                self.stdout.write(self.style.WARNING('Сущность документа с названием "%s" уже была создана' % doc.name))
