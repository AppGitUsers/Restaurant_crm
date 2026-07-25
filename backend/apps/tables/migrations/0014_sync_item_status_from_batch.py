from django.db import migrations


def sync_item_status(apps, schema_editor):
    TableOrderBatch = apps.get_model('tables', 'TableOrderBatch')
    TableOrderItem  = apps.get_model('tables', 'TableOrderItem')

    # Map batch status → item status (only SERVED and PREPARING need updating;
    # PENDING is already the item default so skip for efficiency)
    for batch_status, item_status in [('SERVED', 'SERVED'), ('PREPARING', 'PREPARING')]:
        batch_ids = list(
            TableOrderBatch.objects
            .filter(status=batch_status)
            .values_list('id', flat=True)
        )
        if batch_ids:
            TableOrderItem.objects.filter(
                batch_id__in=batch_ids,
                cancelled_by_kitchen=False,
            ).update(status=item_status)


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0013_kitchen_tableorderitem_status'),
    ]

    operations = [
        migrations.RunPython(sync_item_status, migrations.RunPython.noop),
    ]
