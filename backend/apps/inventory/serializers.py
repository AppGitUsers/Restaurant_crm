from rest_framework import serializers
from .models import Vendor, Stock, VendorInvoice, InvoiceItem, InvoicePayment, StockTransaction


class VendorSerializer(serializers.ModelSerializer):
    invoice_count = serializers.SerializerMethodField()

    class Meta:
        model  = Vendor
        fields = ['id', 'name', 'contact_name', 'phone', 'email',
                  'address', 'gstin', 'is_active', 'invoice_count', 'created_at']

    def get_invoice_count(self, obj):
        return obj.invoices.count()


class StockSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source='ingredient.name', read_only=True)
    unit            = serializers.CharField(source='ingredient.unit', read_only=True)
    is_low          = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Stock
        fields = ['id', 'ingredient', 'ingredient_name', 'unit',
                  'current_quantity', 'minimum_threshold', 'is_low', 'updated_at']


class InvoiceItemSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source='ingredient.name', read_only=True)
    unit            = serializers.CharField(source='ingredient.unit', read_only=True)
    line_total      = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_quantity  = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)

    class Meta:
        model  = InvoiceItem
        fields = ['id', 'ingredient', 'ingredient_name', 'unit',
                  'quantity', 'qty_per_package', 'unit_price', 'line_total', 'stock_quantity']


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
