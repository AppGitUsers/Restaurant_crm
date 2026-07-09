from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings_app', '0002_restaurantsettings_kitchen_cancel_pin'),
    ]

    operations = [
        migrations.AddField(
            model_name='restaurantsettings',
            name='qr_ordering_enabled',
            field=models.BooleanField(
                default=True,
                help_text='Allow customers to place orders by scanning the table QR code. When off, QR shows menu only.',
            ),
        ),
    ]
