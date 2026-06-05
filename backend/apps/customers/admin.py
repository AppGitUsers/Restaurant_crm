from django.contrib import admin
from .models import Customer, Visit

class VisitInline(admin.TabularInline):
    model     = Visit
    extra     = 0
    readonly_fields = ['order_number', 'amount_spent', 'visited_at']

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display  = ['name', 'phone', 'frequency_tag', 'total_visits', 'total_spent']
    list_filter   = ['frequency_tag']
    search_fields = ['name', 'phone', 'email']
    inlines       = [VisitInline]
