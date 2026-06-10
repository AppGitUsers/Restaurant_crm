from django.contrib import admin
from .models import RestaurantSettings


@admin.register(RestaurantSettings)
class RestaurantSettingsAdmin(admin.ModelAdmin):
    readonly_fields = ['updated_at']
