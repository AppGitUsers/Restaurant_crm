import datetime
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0002_transaction_tax_amount'),
    ]

    operations = [
        migrations.AlterField(
            model_name='transaction',
            name='tx_date',
            field=models.DateField(default=datetime.date.today),
        ),
    ]
