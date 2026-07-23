from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0008_tableorderbatch_pending_payment'),
    ]

    operations = [
        migrations.AddField(
            model_name='tablesession',
            name='customer_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='tablesession',
            name='customer_phone',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='tablesession',
            name='order_type',
            field=models.CharField(default='DINE_IN', max_length=10),
        ),
    ]
