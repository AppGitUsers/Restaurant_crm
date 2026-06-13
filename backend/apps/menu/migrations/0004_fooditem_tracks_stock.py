from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0003_foodtype_is_customizable'),
    ]

    operations = [
        migrations.AddField(
            model_name='fooditem',
            name='tracks_stock',
            field=models.BooleanField(default=True),
        ),
    ]
