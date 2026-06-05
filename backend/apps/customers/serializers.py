from rest_framework import serializers
from .models import Customer, Visit

class VisitSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Visit
        fields = ['id', 'customer', 'order_number', 'amount_spent', 'visited_at']

class CustomerSerializer(serializers.ModelSerializer):
    visits       = VisitSerializer(many=True, read_only=True)
    visit_count  = serializers.IntegerField(source='total_visits', read_only=True)

    class Meta:
        model  = Customer
        fields = ['id', 'name', 'phone', 'email', 'address', 'frequency_tag',
                  'total_visits', 'total_spent', 'notes', 'visits', 'visit_count',
                  'created_at', 'updated_at']
        read_only_fields = ['frequency_tag', 'total_visits', 'total_spent']
