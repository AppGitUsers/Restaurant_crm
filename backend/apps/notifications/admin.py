from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display  = ['notification_type', 'recipient_phone', 'status', 'reference', 'created_at', 'sent_at']
    list_filter   = ['notification_type', 'status']
    search_fields = ['recipient_phone', 'reference', 'message']
    readonly_fields = ['created_at', 'sent_at', 'error_message']
    ordering      = ['-created_at']
