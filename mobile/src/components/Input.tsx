import React from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  className?: string;
}

export function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <View className={`w-full ${className}`}>
      {label ? (
        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor="#94a3b8"
        className={`w-full rounded-2xl bg-lav px-4 py-3.5 text-base text-ink ${
          error ? 'border border-danger' : ''
        }`}
        {...rest}
      />
      {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
