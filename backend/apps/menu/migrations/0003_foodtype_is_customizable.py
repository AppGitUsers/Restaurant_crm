from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0002_addon_foodtype_addons'),
    ]

    operations = [
        migrations.AddField(
            model_name='foodtype',
            name='is_customizable',
            field=models.BooleanField(default=False),
        ),
    ]
