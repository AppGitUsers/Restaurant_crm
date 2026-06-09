import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('staff', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='linked_employee',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='user_account',
                to='staff.employee',
            ),
        ),
        migrations.AlterField(
            model_name='customuser',
            name='role',
            field=models.CharField(
                choices=[('ADMIN', 'Admin'), ('BILLER', 'Biller'), ('KITCHEN', 'Kitchen')],
                default='BILLER',
                max_length=10,
            ),
        ),
    ]
