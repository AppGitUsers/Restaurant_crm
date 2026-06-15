import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0004_ordercounter'),
        ('tables',  '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='table_session',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='order',
                to='tables.tablesession',
            ),
        ),
    ]
