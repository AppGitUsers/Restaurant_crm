import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0005_order_table_session'),
    ]

    operations = [
        # Step 1: add column without unique constraint, nullable temporarily
        migrations.AddField(
            model_name='order',
            name='share_token',
            field=models.UUIDField(null=True, blank=True),
        ),
        # Step 2: fill each existing row with a distinct UUID
        migrations.RunSQL(
            "UPDATE billing_order SET share_token = gen_random_uuid() WHERE share_token IS NULL;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        # Step 3: make non-nullable with default and add unique index
        migrations.AlterField(
            model_name='order',
            name='share_token',
            field=models.UUIDField(default=uuid.uuid4, unique=True),
        ),
    ]
