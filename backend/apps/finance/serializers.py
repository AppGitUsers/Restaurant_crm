from rest_framework import serializers
from .models import Transaction, Expense, DailyReport


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Transaction
        fields = '__all__'


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Expense
        fields = '__all__'


class DailyReportSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DailyReport
        fields = '__all__'
