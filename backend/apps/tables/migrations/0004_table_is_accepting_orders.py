from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tables', '0003_tablesession_session_key'),
    ]

    operations = [
        migrations.AddField(
            model_name='table',
            name='is_accepting_orders',
            field=models.BooleanField(
                default=False,
                help_text='Biller must open the table before customers can order',
            ),
        ),
    ]
