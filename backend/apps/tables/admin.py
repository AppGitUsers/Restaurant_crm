from django.contrib import admin
from .models import Table, TableSession, TableOrderBatch, TableOrderItem


class TableOrderItemInline(admin.TabularInline):
    model  = TableOrderItem
    extra  = 0
    fields = ['food_item', 'quantity', 'unit_price', 'addon_unit_price', 'notes']


class TableOrderBatchInline(admin.TabularInline):
    model  = TableOrderBatch
    extra  = 0
    fields = ['status', 'added_by', 'placed_at', 'notes']
    readonly_fields = ['placed_at']


@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display  = ['number', 'qr_token', 'is_active']
    list_editable = ['is_active']
    ordering      = ['number']


@admin.register(TableSession)
class TableSessionAdmin(admin.ModelAdmin):
    list_display   = ['table', 'status', 'opened_at', 'closed_at', 'discount']
    list_filter    = ['status']
    inlines        = [TableOrderBatchInline]


@admin.register(TableOrderBatch)
class TableOrderBatchAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'status', 'added_by', 'placed_at']
    list_filter  = ['status', 'added_by']
    inlines      = [TableOrderItemInline]
