from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoiceitem',
            name='qty_per_package',
            field=models.DecimalField(
                decimal_places=3,
                default=1,
                help_text='Units per package (e.g. 500 ml per bottle)',
                max_digits=12,
            ),
        ),
        migrations.AddField(
            model_name='vendorinvoice',
            name='extra_charges',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='GST, delivery, or other additional charges',
                max_digits=12,
            ),
        ),
        migrations.AlterField(
            model_name='vendorinvoice',
            name='invoice_number',
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
