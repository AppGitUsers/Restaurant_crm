from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0005_tableorderitem_cancelled_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='tableorderbatch',
            name='served_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
