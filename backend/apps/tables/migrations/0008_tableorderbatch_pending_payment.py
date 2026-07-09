from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0007_tableorderbatch_counter_order'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tableorderbatch',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING_PAYMENT', 'Pending Payment'),
                    ('PENDING', 'Pending'),
                    ('PREPARING', 'Preparing'),
                    ('SERVED', 'Served'),
                ],
                default='PENDING',
                max_length=16,
            ),
        ),
    ]
