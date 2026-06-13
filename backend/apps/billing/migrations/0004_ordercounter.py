from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0003_orderitem_custom'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderCounter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(unique=True)),
                ('count', models.PositiveIntegerField(default=0)),
            ],
            options={
                'ordering': [],
            },
        ),
    ]
