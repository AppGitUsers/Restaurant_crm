from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0009_tablesession_customer_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='tableorderbatch',
            name='order_type',
            field=models.CharField(blank=True, max_length=10, null=True),
        ),
        migrations.RemoveField(
            model_name='tablesession',
            name='order_type',
        ),
    ]
