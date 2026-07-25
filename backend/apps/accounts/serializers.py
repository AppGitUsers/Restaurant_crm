from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import CustomUser


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role']     = user.role
        token['username'] = user.username
        token['email']    = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['role']     = self.user.role
        data['username'] = self.user.username
        data['email']    = self.user.email
        data['user_id']  = self.user.id
        return data


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model  = CustomUser
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'phone', 'is_active', 'password', 'linked_employee', 'kitchen', 'date_joined']
        read_only_fields = ['date_joined']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserListSerializer(serializers.ModelSerializer):
    linked_employee_name = serializers.SerializerMethodField()
    kitchen_name         = serializers.SerializerMethodField()

    class Meta:
        model  = CustomUser
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'phone', 'is_active', 'linked_employee',
                  'linked_employee_name', 'kitchen', 'kitchen_name', 'date_joined']

    def get_linked_employee_name(self, obj):
        return obj.linked_employee.name if obj.linked_employee else None

    def get_kitchen_name(self, obj):
        return obj.kitchen.name if obj.kitchen_id else None
