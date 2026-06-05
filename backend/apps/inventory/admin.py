from django.contrib import admin
from .models import Vendor, Stock, VendorInvoice, InvoiceItem, InvoicePayment, StockTransaction


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display  = ['name', 'contact_name', 'phone', 'email', 'is_active']
    list_filter   = ['is_active']
    search_fields = ['name', 'contact_name', 'phone']


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display  = ['ingredient', 'current_quantity', 'minimum_threshold', 'is_low']
    search_fields = ['ingredient__name']

    def is_low(self, obj):
        return obj.is_low
    is_low.boolean = True


class InvoiceItemInline(admin.TabularInline):
    model               = InvoiceItem
    extra               = 1
    autocomplete_fields = ['ingredient']


class InvoicePaymentInline(admin.TabularInline):
    model = InvoicePayment
    extra = 1


@admin.register(VendorInvoice)
class VendorInvoiceAdmin(admin.ModelAdmin):
    list_display  = ['invoice_number', 'vendor', 'invoice_date', 'total_amount',
                     'paid_amount', 'status', 'stock_updated']
    list_filter   = ['status', 'stock_updated']
    search_fields = ['invoice_number', 'vendor__name']
    inlines       = [InvoiceItemInline, InvoicePaymentInline]


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display  = ['ingredient', 'tx_type', 'quantity', 'reference', 'created_at']
    list_filter   = ['tx_type']
    search_fields = ['ingredient__name', 'reference']
