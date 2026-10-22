from rest_framework import serializers

from .models import Company, User

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ("id", "inn", "ogrn", "name", "legal_form", "tax_regime", "registered_at")


class MeSerializer(serializers.ModelSerializer):
    company = CompanySerializer(read_only=True, allow_null=True)
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role", "company")

class AccessTokenSerializer(serializers.Serializer):
    access = serializers.CharField()