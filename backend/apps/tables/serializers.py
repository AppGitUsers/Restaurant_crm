from rest_framework import serializers
from apps.menu.models import FoodItem
from .models import Table, TableSession, TableOrderBatch, TableOrderItem


class TableAdminSerializer(serializers.ModelSerializer):
    session_count = serializers.SerializerMethodField()

    class Meta:
        model        = Table
        fields       = ['id', 'number', 'qr_token', 'is_active', 'is_accepting_orders', 'session_count']
        read_only_fields = ['qr_token']

    def get_session_count(self, obj):
        return obj.sessions.filter(status='BILLED').count()


class PublicMenuItemSerializer(serializers.ModelSerializer):
    food_type_id           = serializers.IntegerField(source='food_type.id',           read_only=True)
    food_type_name         = serializers.CharField(source='food_type.name',            read_only=True)
    food_type_icon         = serializers.CharField(source='food_type.icon',            read_only=True)
    food_type_allow_addons = serializers.BooleanField(source='food_type.allow_addons', read_only=True)
    food_type_addons       = serializers.SerializerMethodField()
    combo_components       = serializers.SerializerMethodField()
    photo_url              = serializers.SerializerMethodField()

    class Meta:
        model  = FoodItem
        fields = [
            'id', 'name', 'description', 'price', 'photo_url',
            'is_available', 'tracks_stock', 'makeable_count', 'is_combo',
            'food_type_id', 'food_type_name', 'food_type_icon',
            'food_type_allow_addons', 'food_type_addons', 'combo_components',
        ]

    def get_food_type_addons(self, obj):
        return [
            {'id': a.id, 'name': a.name, 'price': float(a.price),
             'is_costed': a.is_costed, 'is_active': a.is_active}
            for a in obj.food_type.addons.filter(is_active=True)
        ]

    def get_combo_components(self, obj):
        if not obj.is_combo:
            return []
        return [
            {
                'id':                   cc.id,
                'component':            cc.component_id,
                'component_name':       cc.component.name,
                'component_price':      float(cc.component.price),
                'component_food_type':  cc.component.food_type_id,
            }
            for cc in obj.combo_components.select_related('component').all()
        ]

    def get_photo_url(self, obj):
        request = self.context.get('request')
        if obj.photo and request:
            return request.build_absolute_uri(obj.photo.url)
        return None


class OrderItemInputSerializer(serializers.Serializer):
    food_item        = serializers.PrimaryKeyRelatedField(
        queryset=FoodItem.objects.filter(is_active=True),
        required=False, allow_null=True,
    )
    custom_name      = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    components       = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=FoodItem.objects.filter(is_active=True)),
        required=False, default=list,
    )
    quantity         = serializers.IntegerField(min_value=1, max_value=20)
    addon_unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    notes            = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')

    def validate(self, data):
        if not data.get('food_item') and not data.get('custom_name'):
            raise serializers.ValidationError('Either food_item or custom_name is required.')
        return data


class OrderSubmitSerializer(serializers.Serializer):
    items       = OrderItemInputSerializer(many=True, min_length=1, max_length=20)
    notes       = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    session_key = serializers.CharField(max_length=64,   required=False, allow_blank=True, default='')


class TableOrderItemSerializer(serializers.ModelSerializer):
    food_item_name = serializers.SerializerMethodField()
    line_total     = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model  = TableOrderItem
        fields = ['id', 'food_item', 'food_item_name', 'custom_name', 'quantity',
                  'unit_price', 'addon_unit_price', 'line_total', 'notes']

    def get_food_item_name(self, obj):
        return obj.food_item.name if obj.food_item_id else (obj.custom_name or 'Custom Item')


class TableOrderBatchSerializer(serializers.ModelSerializer):
    items        = TableOrderItemSerializer(many=True, read_only=True)
    table_number = serializers.IntegerField(source='session.table.number', read_only=True)
    session_id   = serializers.IntegerField(source='session.id',           read_only=True)

    class Meta:
        model  = TableOrderBatch
        fields = ['id', 'table_number', 'session_id',
                  'status', 'added_by', 'placed_at', 'notes', 'items']


class TableSessionSerializer(serializers.ModelSerializer):
    batches      = TableOrderBatchSerializer(many=True, read_only=True)
    table_number = serializers.IntegerField(source='table.number', read_only=True)
    subtotal     = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    item_count   = serializers.IntegerField(read_only=True)

    class Meta:
        model  = TableSession
        fields = ['id', 'table', 'table_number', 'status',
                  'opened_at', 'closed_at', 'discount',
                  'subtotal', 'item_count', 'batches']


class TableSerializer(serializers.ModelSerializer):
    active_session   = serializers.SerializerMethodField()
    pending_sessions = serializers.SerializerMethodField()

    class Meta:
        model  = Table
        fields = ['id', 'number', 'qr_token', 'is_active', 'is_accepting_orders',
                  'active_session', 'pending_sessions']

    def get_active_session(self, obj):
        session = obj.get_active_session()
        if not session:
            return None
        return {
            'id':         session.id,
            'opened_at':  session.opened_at,
            'subtotal':   float(session.subtotal),
            'item_count': session.item_count,
        }

    def get_pending_sessions(self, obj):
        """All CLOSED (manually ended, not yet billed) sessions for this table, newest first."""
        sessions = (obj.sessions
                    .filter(status=TableSession.Status.CLOSED)
                    .order_by('-closed_at'))
        return [
            {
                'id':         s.id,
                'opened_at':  s.opened_at,
                'closed_at':  s.closed_at,
                'subtotal':   float(s.subtotal),
                'item_count': s.item_count,
            }
            for s in sessions
        ]
