from django.contrib import admin

from .models import DocumentRequirement, Product


# ПРАВКА (необязательно): колонки и фильтры, чтобы главное было видно прямо в списке
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "min_amount", "max_amount", "max_term_months", "base_rate", "is_active", "sort_order")
    list_editable = ("is_active", "sort_order")


@admin.register(DocumentRequirement)
class DocumentRequirementAdmin(admin.ModelAdmin):
    list_display = ("name", "doc_type", "product", "legal_form", "tax_regime", "is_required")
    list_filter = ("product", "legal_form", "tax_regime", "is_required")
