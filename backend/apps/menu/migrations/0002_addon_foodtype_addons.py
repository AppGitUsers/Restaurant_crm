from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Addon',
            fields=[
                ('id',         models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name',       models.CharField(max_length=200, unique=True)),
                ('is_costed',  models.BooleanField(default=False)),
                ('price',      models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('is_active',  models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='foodtype',
            name='allow_addons',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='foodtype',
            name='addons',
            field=models.ManyToManyField(blank=True, related_name='food_types', to='menu.addon'),
        ),
    ]
