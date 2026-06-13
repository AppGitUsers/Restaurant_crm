import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0004_fooditem_tracks_stock'),
    ]

    operations = [
        migrations.AddField(
            model_name='fooditem',
            name='is_combo',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='ComboComponent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('combo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='combo_components', to='menu.fooditem')),
                ('component', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='used_in_combos', to='menu.fooditem')),
            ],
            options={
                'ordering': ['id'],
                'unique_together': {('combo', 'component')},
            },
        ),
    ]
