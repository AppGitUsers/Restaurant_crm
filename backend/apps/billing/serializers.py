import re
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
        fields = ['id', 'order_number', 'share_token', 'biller', 'biller_name',
                  'customer_name', 'customer_phone', 'status', 'payment_method', 'order_type',
                  'subtotal', 'discount', 'tax_percent', 'tax_amount', 'total_amount',
                  'notes', 'items', 'created_at', 'updated_at']
        read_only_fields = ['order_number', 'share_token', 'subtotal', 'tax_amount', 'total_amount']

    def get_biller_name(self, obj):
        if obj.biller:
            return f"{obj.biller.first_name} {obj.biller.last_name}".strip() or obj.biller.username
        return None


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)

    class Meta:
        model  = Order
        fields = ['customer_name', 'customer_phone', 'payment_method', 'order_type',
                  'discount', 'tax_percent', 'notes', 'items']
        extra_kwargs = {
            'customer_name':  {'required': False, 'allow_blank': True, 'default': ''},
            'customer_phone': {'required': False, 'allow_blank': True, 'default': ''},
        }

    def validate_customer_phone(self, value):
        if not value:
            return value
        digits = re.sub(r'\D', '', value)
        if len(digits) < 10 or len(digits) > 15:
            raise serializers.ValidationError('Enter a valid phone number (10–15 digits).')
        return digits

    def create(self, validated_data):
        from apps.settings_app.models import RestaurantSettings
        validated_data['tax_percent'] = RestaurantSettings.get_settings().gst_rate
        items_data = validated_data.pop('items')
        order = Order.objects.create(**validated_data)
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        order.recalculate_totals()
        return order

    def to_representation(self, instance):
        return OrderSerializer(instance).data
