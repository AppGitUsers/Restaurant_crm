from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('staff', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='shift',
            name='late_threshold',
            field=models.PositiveIntegerField(
                default=15,
                help_text='Minutes after start time before marked late',
            ),
        ),
        migrations.AddField(
            model_name='shift',
            name='ot_threshold',
            field=models.PositiveIntegerField(
                default=30,
                help_text='Minutes beyond shift end before counted as overtime',
            ),
        ),
        migrations.AddField(
            model_name='shift',
            name='days',
            field=models.CharField(
                default='MON,TUE,WED,THU,FRI',
                help_text='Comma-separated day codes: MON,TUE,WED,THU,FRI,SAT,SUN',
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='shift',
            name='notes',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
    ]
