from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0002_orderitem_addon_unit_price'),
        ('menu', '0003_foodtype_is_customizable'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderitem',
            name='custom_name',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name='orderitem',
            name='food_item',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to='menu.fooditem',
            ),
        ),
    ]
