from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0002_shift_enhancements'),
    ]

    operations = [
        migrations.RenameField(
            model_name='employee',
            old_name='hourly_rate',
            new_name='monthly_salary',
        ),
        migrations.AlterField(
            model_name='employee',
            name='monthly_salary',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
