from django.urls import path
from . import views

urlpatterns = [
    # Public — no auth, customer QR endpoints
    path('public/table/<uuid:qr_token>/menu/',  views.PublicMenuView.as_view(),        name='public-menu'),
    path('public/table/<uuid:qr_token>/order/', views.PublicOrderSubmitView.as_view(), name='public-order'),

    # Kitchen — authenticated (ADMIN + BILLER + KITCHEN)
    path('kitchen/batches/',                   views.KitchenBatchListView.as_view(),   name='kitchen-batch-list'),
    path('kitchen/batches/<int:batch_id>/',    views.KitchenBatchUpdateView.as_view(), name='kitchen-batch-update'),

    # Biller — authenticated
    path('tables/',                                        views.TableListView.as_view(),            name='table-list'),
    path('tables/sessions/<int:session_id>/',              views.TableSessionDetailView.as_view(),   name='table-session-detail'),
    path('tables/sessions/<int:session_id>/add_batch/',    views.TableSessionAddBatchView.as_view(), name='table-session-add-batch'),
    path('tables/sessions/<int:session_id>/bill/',         views.TableSessionBillView.as_view(),     name='table-session-bill'),

    # Admin — table management
    path('admin/tables/',                views.TableAdminListCreateView.as_view(), name='admin-table-list'),
    path('admin/tables/<int:table_id>/', views.TableAdminDetailView.as_view(),    name='admin-table-detail'),
]
