from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from apps.staff.essl_views import EsslPushView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('iclock/cdata', EsslPushView.as_view(), name='essl_push'),
    path('api/auth/',      include('apps.accounts.urls')),
    path('api/menu/',      include('apps.menu.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/billing/',   include('apps.billing.urls')),
    path('api/finance/',   include('apps.finance.urls')),
    path('api/staff/',     include('apps.staff.urls')),
    path('api/customers/', include('apps.customers.urls')),
    path('api/dashboard/',      include('apps.dashboard.urls')),
    path('api/settings/',       include('apps.settings_app.urls')),
    path('api/notifications/',  include('apps.notifications.urls')),
    path('api/',                include('apps.tables.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
