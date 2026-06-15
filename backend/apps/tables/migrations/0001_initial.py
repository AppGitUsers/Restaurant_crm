import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('menu', '0005_fooditem_is_combo_comboccomponent'),
    ]

    operations = [
        migrations.CreateModel(
            name='Table',
            fields=[
                ('id',        models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number',    models.PositiveIntegerField(unique=True)),
                ('qr_token',  models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['number']},
        ),
        migrations.CreateModel(
            name='TableSession',
            fields=[
                ('id',        models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status',    models.CharField(choices=[('OPEN', 'Open'), ('BILLED', 'Billed')], default='OPEN', max_length=10)),
                ('opened_at', models.DateTimeField(auto_now_add=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('discount',  models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('table',     models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sessions', to='tables.table')),
            ],
            options={'ordering': ['-opened_at']},
        ),
        migrations.AddConstraint(
            model_name='tablesession',
            constraint=models.UniqueConstraint(
                condition=models.Q(status='OPEN'),
                fields=['table'],
                name='unique_open_session_per_table',
            ),
        ),
        migrations.CreateModel(
            name='TableOrderBatch',
            fields=[
                ('id',        models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status',    models.CharField(choices=[('PENDING', 'Pending'), ('PREPARING', 'Preparing'), ('SERVED', 'Served')], default='PENDING', max_length=10)),
                ('added_by',  models.CharField(choices=[('CUSTOMER', 'Customer'), ('BILLER', 'Biller')], default='CUSTOMER', max_length=10)),
                ('placed_at', models.DateTimeField(auto_now_add=True)),
                ('notes',     models.TextField(blank=True)),
                ('session',   models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='batches', to='tables.tablesession')),
            ],
            options={'ordering': ['placed_at']},
        ),
        migrations.CreateModel(
            name='TableOrderItem',
            fields=[
                ('id',              models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity',        models.PositiveIntegerField(default=1)),
                ('unit_price',      models.DecimalField(decimal_places=2, max_digits=10)),
                ('addon_unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('notes',           models.TextField(blank=True)),
                ('batch',           models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='tables.tableorderbatch')),
                ('food_item',       models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='table_order_items', to='menu.fooditem')),
            ],
        ),
    ]
