from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    food_item_name = serializers.SerializerMethodField()
    food_type_name = serializers.SerializerMethodField()
    line_total     = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model  = OrderItem
        fields = ['id', 'food_item', 'food_item_name', 'food_type_name',
                  'custom_name', 'quantity', 'unit_price', 'addon_unit_price',
                  'line_total', 'notes']
        extra_kwargs = {'food_item': {'required': False, 'allow_null': True}}

    def get_food_item_name(self, obj):
        if obj.food_item:
            return obj.food_item.name
        return obj.custom_name or 'Custom Item'

    def get_food_type_name(self, obj):
        if obj.food_item:
            return obj.food_item.food_type.name
        return 'Custom'


class OrderSerializer(serializers.ModelSerializer):
    items        = OrderItemSerializer(many=True, read_only=True)
    biller_name  = serializers.SerializerMethodField()

    class Meta:
        model  = Order
        fields = ['id', 'order_number', 'biller', 'biller_name',
                  'customer_name', 'customer_phone', 'status', 'payment_method',
                  'subtotal', 'discount', 'tax_percent', 'tax_amount', 'total_amount',
                  'notes', 'items', 'created_at', 'updated_at']
        read_only_fields = ['order_number', 'subtotal', 'tax_amount', 'total_amount']

    def get_biller_name(self, obj):
        if obj.biller:
            return f"{obj.biller.first_name} {obj.biller.last_name}".strip() or obj.biller.username
        return None


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)

    class Meta:
        model  = Order
        fields = ['customer_name', 'customer_phone', 'payment_method',
                  'discount', 'tax_percent', 'notes', 'items']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        order = Order.objects.create(**validated_data)
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        order.recalculate_totals()
        return order
