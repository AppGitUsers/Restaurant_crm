from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0001_initial'),
        ('tables', '0006_tableorderbatch_served_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='tableorderbatch',
            name='billing_order',
            field=models.OneToOneField(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='kitchen_batch',
                to='billing.order',
            ),
        ),
        migrations.AlterField(
            model_name='tableorderbatch',
            name='session',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='batches',
                to='tables.tablesession',
            ),
        ),
    ]
