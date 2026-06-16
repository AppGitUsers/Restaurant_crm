from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0002_tableorderitem_custom_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='tablesession',
            name='session_key',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]
