from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='tax_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
