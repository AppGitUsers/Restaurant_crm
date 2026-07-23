import re
from rest_framework import serializers
from .models import (Vendor, Stock, VendorInvoice, InvoiceItem, InvoicePayment,
                     StockTransaction, PackagingItem, FoodTypePackaging)


class VendorSerializer(serializers.ModelSerializer):
    invoice_count = serializers.SerializerMethodField()

    class Meta:
        model  = Vendor
        fields = ['id', 'name', 'contact_name', 'phone', 'email',
                  'address', 'gstin', 'is_active', 'invoice_count', 'created_at']

    def get_invoice_count(self, obj):
        return obj.invoices.count()

    def validate_phone(self, value):
        if not value:
            return value
        digits = re.sub(r'\D', '', value)
        if len(digits) < 10 or len(digits) > 15:
            raise serializers.ValidationError('Enter a valid phone number (10–15 digits).')
        return digits


class StockSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source='ingredient.name', read_only=True)
    unit            = serializers.CharField(source='ingredient.unit', read_only=True)
    is_low          = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Stock
        fields = ['id', 'ingredient', 'ingredient_name', 'unit',
                  'current_quantity', 'minimum_threshold', 'is_low', 'updated_at']


class PackagingItemSerializer(serializers.ModelSerializer):
    is_low = serializers.BooleanField(read_only=True)

    class Meta:
        model  = PackagingItem
        fields = ['id', 'name', 'unit', 'current_quantity', 'low_stock_threshold',
                  'is_low', 'created_at', 'updated_at']


class FoodTypePackagingSerializer(serializers.ModelSerializer):
    food_type_name     = serializers.CharField(source='food_type.name', read_only=True)
    packaging_item_name = serializers.CharField(source='packaging_item.name', read_only=True)
    packaging_unit     = serializers.CharField(source='packaging_item.unit', read_only=True)

    class Meta:
        model  = FoodTypePackaging
        fields = ['id', 'food_type', 'food_type_name', 'packaging_item', 'packaging_item_name',
                  'packaging_unit', 'order_type', 'qty_per_serving']


class InvoiceItemSerializer(serializers.ModelSerializer):
    ingredient_name      = serializers.SerializerMethodField()
    packaging_item_name  = serializers.SerializerMethodField()
    unit                 = serializers.SerializerMethodField()
    item_type            = serializers.SerializerMethodField()
    line_total           = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_quantity       = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)

    class Meta:
        model  = InvoiceItem
        fields = ['id', 'ingredient', 'packaging_item', 'item_type',
                  'ingredient_name', 'packaging_item_name', 'unit',
                  'quantity', 'qty_per_package', 'unit_price', 'line_total', 'stock_quantity']

    def get_item_type(self, obj):
        if obj.ingredient_id:
            return 'ingredient'
        if obj.packaging_item_id:
            return 'packaging'
        return None

    def get_ingredient_name(self, obj):
        if obj.ingredient_id:
            return obj.ingredient.name
        return None

    def get_packaging_item_name(self, obj):
        if obj.packaging_item_id:
            return obj.packaging_item.name
        return None

    def get_unit(self, obj):
        if obj.ingredient_id:
            return obj.ingredient.unit
        if obj.packaging_item_id:
            return obj.packaging_item.unit
        return None

    def validate(self, data):
        ingredient     = data.get('ingredient')
        packaging_item = data.get('packaging_item')
        if not ingredient and not packaging_item:
            raise serializers.ValidationError(
                'Each invoice line must have either an ingredient or a packaging item.'
            )
        if ingredient and packaging_item:
            raise serializers.ValidationError(
                'Each invoice line can only be an ingredient or a packaging item, not both.'
            )
        return data


class InvoicePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = InvoicePayment
        fields = ['id', 'invoice', 'amount', 'payment_date',
                  'payment_method', 'notes', 'created_at']
        read_only_fields = ['invoice']


class VendorInvoiceSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    items       = InvoiceItemSerializer(many=True, read_only=True)
    payments    = InvoicePaymentSerializer(many=True, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model  = VendorInvoice
        fields = ['id', 'vendor', 'vendor_name', 'invoice_number', 'invoice_date',
                  'due_date', 'total_amount', 'extra_charges', 'paid_amount', 'balance_due',
                  'status', 'notes', 'stock_updated', 'items', 'payments', 'created_at']


class VendorInvoiceWriteSerializer(serializers.ModelSerializer):
    items          = InvoiceItemSerializer(many=True)
    invoice_number = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)

    class Meta:
        model  = VendorInvoice
        fields = ['vendor', 'invoice_number', 'invoice_date', 'due_date',
                  'total_amount', 'extra_charges', 'notes', 'items']

    def validate_invoice_number(self, value):
        return value if value else None

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        invoice    = VendorInvoice.objects.create(**validated_data)
        if not invoice.invoice_number:
            invoice.invoice_number = f"INV-{invoice.invoice_date.strftime('%Y%m%d')}-{invoice.id:04d}"
            invoice.save(update_fields=['invoice_number'])
        for item in items_data:
            InvoiceItem.objects.create(invoice=invoice, **item)
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                InvoiceItem.objects.create(invoice=instance, **item)
        return instance


class StockTransactionSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source='ingredient.name', read_only=True)
    unit            = serializers.CharField(source='ingredient.unit', read_only=True)

    class Meta:
        model  = StockTransaction
        fields = ['id', 'ingredient', 'ingredient_name', 'unit',
                  'tx_type', 'quantity', 'reference', 'note', 'created_at']
