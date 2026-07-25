from django.urls import path
from . import views

urlpatterns = [
    # Public — no auth, customer QR endpoints
    path('public/table/<uuid:qr_token>/menu/',  views.PublicMenuView.as_view(),        name='public-menu'),
    path('public/table/<uuid:qr_token>/order/',                        views.PublicOrderSubmitView.as_view(),  name='public-order'),
    path('public/table/<uuid:qr_token>/orders/<int:batch_id>/cancel/', views.PublicBatchCancelView.as_view(), name='public-order-cancel'),

    # Kitchen — authenticated (ADMIN + BILLER + KITCHEN)
    path('kitchen/batches/',                            views.KitchenBatchListView.as_view(),   name='kitchen-batch-list'),
    path('kitchen/batches/<int:batch_id>/',             views.KitchenBatchUpdateView.as_view(), name='kitchen-batch-update'),
    path('kitchen/items/<int:item_id>/cancel/',         views.KitchenCancelItemView.as_view(),  name='kitchen-item-cancel'),
    path('kitchen/items/<int:item_id>/reduce/',         views.KitchenReduceItemView.as_view(),  name='kitchen-item-reduce'),
    path('biller/items/<int:item_id>/cancel/',          views.BillerCancelItemView.as_view(),   name='biller-item-cancel'),
    path('biller/items/<int:item_id>/reduce/',          views.BillerReduceItemView.as_view(),   name='biller-item-reduce'),

    # Public — customer notification ack
    path('public/table/<uuid:qr_token>/notifications/ack/', views.CustomerAckNotificationView.as_view(), name='customer-ack-notification'),

    # Biller — authenticated
    path('tables/today/',                                  views.TodaySessionsView.as_view(),        name='today-sessions'),
    path('tables/',                                        views.TableListView.as_view(),            name='table-list'),
    path('tables/sessions/<int:session_id>/',              views.TableSessionDetailView.as_view(),   name='table-session-detail'),
    path('tables/sessions/<int:session_id>/add_batch/',    views.TableSessionAddBatchView.as_view(), name='table-session-add-batch'),
    path('tables/sessions/<int:session_id>/bill/',         views.TableSessionBillView.as_view(),     name='table-session-bill'),
    path('tables/sessions/<int:session_id>/end/',          views.TableSessionEndView.as_view(),      name='table-session-end'),
    path('tables/<int:table_id>/open/',                    views.TableOpenView.as_view(),            name='table-open'),

    # Admin — table management
    path('admin/tables/',                views.TableAdminListCreateView.as_view(), name='admin-table-list'),
    path('admin/tables/<int:table_id>/', views.TableAdminDetailView.as_view(),    name='admin-table-detail'),

    # Admin — kitchen station management
    path('admin/kitchens/',                    views.KitchenAdminListCreateView.as_view(), name='admin-kitchen-list'),
    path('admin/kitchens/<int:kitchen_id>/',   views.KitchenAdminDetailView.as_view(),    name='admin-kitchen-detail'),
]
