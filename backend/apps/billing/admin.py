from django.contrib import admin
from .models import Order, OrderItem

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ['line_total']

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display  = ['order_number', 'customer_name', 'total_amount', 'status', 'payment_method', 'created_at']
    list_filter   = ['status', 'payment_method']
    search_fields = ['order_number', 'customer_name', 'customer_phone']
    readonly_fields = ['order_number', 'subtotal', 'tax_amount', 'total_amount']
    inlines       = [OrderItemInline]
