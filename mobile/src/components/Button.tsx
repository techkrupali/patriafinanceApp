import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const containerStyles: Record<Variant, string> = {
  primary: 'bg-navy',
  secondary: 'bg-lav',
  danger: 'bg-danger-soft',
};

const textStyles: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-navy',
  danger: 'text-danger',
};

const spinnerColor: Record<Variant, string> = {
  primary: '#ffffff',
  secondary: '#001736',
  danger: '#ba1a1a',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`w-full items-center justify-center rounded-2xl py-4 ${containerStyles[variant]} ${
        isDisabled ? 'opacity-50' : 'active:opacity-80'
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor[variant]} />
      ) : (
        <Text className={`text-base font-semibold ${textStyles[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}
