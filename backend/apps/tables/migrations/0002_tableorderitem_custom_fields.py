from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0005_fooditem_is_combo_comboccomponent'),
        ('tables', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='tableorderitem',
            name='custom_name',
            field=models.CharField(blank=True, default='', max_length=200),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='tableorderitem',
            name='food_item',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='table_order_items',
                to='menu.fooditem',
            ),
        ),
    ]
