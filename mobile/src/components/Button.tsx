import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, shadow } from '../theme';
import { selection } from '../lib/haptics';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  className?: string;
}

const surface: Record<Exclude<Variant, 'primary'>, string> = {
  secondary: 'bg-lav',
  ghost: 'bg-transparent',
  danger: 'bg-danger-soft',
};

const textColor: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-navy',
  ghost: 'text-brand',
  danger: 'text-danger',
};

const iconColor: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.navy,
  ghost: colors.brand,
  danger: colors.danger,
};

const spinnerColor: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.navy,
  ghost: colors.brand,
  danger: colors.danger,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'right',
  className = '',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  const handlePress = () => {
    if (isDisabled) return;
    selection();
    onPress?.();
  };

  const content = loading ? (
    <ActivityIndicator color={spinnerColor[variant]} />
  ) : (
    <View className="flex-row items-center justify-center">
      {icon && iconPosition === 'left' ? (
        <Ionicons name={icon} size={18} color={iconColor[variant]} style={{ marginRight: 8 }} />
      ) : null}
      <Text className={`text-base font-semibold ${textColor[variant]}`}>{title}</Text>
      {icon && iconPosition === 'right' ? (
        <Ionicons name={icon} size={18} color={iconColor[variant]} style={{ marginLeft: 8 }} />
      ) : null}
    </View>
  );

  return (
    <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => !isDisabled && animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        disabled={isDisabled}
        className={`w-full ${className}`}
      >
        {variant === 'primary' ? (
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              {
                minHeight: 54,
                borderRadius: 18,
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
              },
              !isDisabled ? shadow.soft : undefined,
              isDisabled ? { opacity: 0.5 } : undefined,
            ]}
          >
            {content}
          </LinearGradient>
        ) : (
          <View
            style={{ minHeight: 54 }}
            className={`w-full items-center justify-center rounded-[18px] px-5 py-4 ${surface[variant]} ${
              isDisabled ? 'opacity-50' : ''
            }`}
          >
            {content}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
