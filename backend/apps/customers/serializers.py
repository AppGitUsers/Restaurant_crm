from rest_framework import serializers
from .models import Customer, Visit

class VisitSerializer(serializers.ModelSerializer):
    order_id = serializers.SerializerMethodField()

    class Meta:
        model  = Visit
        fields = ['id', 'customer', 'order_number', 'order_id', 'amount_spent', 'visited_at']

    def get_order_id(self, obj):
        from apps.billing.models import Order
        try:
            return Order.objects.get(order_number=obj.order_number).id
        except Order.DoesNotExist:
            return None

class CustomerSerializer(serializers.ModelSerializer):
    visits       = VisitSerializer(many=True, read_only=True)
    visit_count  = serializers.IntegerField(source='total_visits', read_only=True)

    class Meta:
        model  = Customer
        fields = ['id', 'name', 'phone', 'email', 'address', 'frequency_tag',
                  'total_visits', 'total_spent', 'notes', 'visits', 'visit_count',
                  'created_at', 'updated_at']
        read_only_fields = ['frequency_tag', 'total_visits', 'total_spent']
