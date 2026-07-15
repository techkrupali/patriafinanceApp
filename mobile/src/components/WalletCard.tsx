import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Wallet } from '../api/types';
import { colors, shadow } from '../theme';
import { formatMoney } from '../lib/format';
import { selection } from '../lib/haptics';
import { walletVisual } from '../lib/walletVisual';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface WalletCardProps {
  wallet: Wallet;
  onPress?: () => void;
  onFund?: () => void;
  onWithdraw?: () => void;
  onSend?: () => void;
  className?: string;
}

function MiniAction({
  icon,
  label,
  onDark,
  onPress,
}: {
  icon: IconName;
  label: string;
  onDark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="items-center active:opacity-70"
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-2xl ${onDark ? 'bg-white/20' : 'bg-white'}`}
      >
        <Ionicons name={icon} size={18} color={onDark ? colors.white : colors.navy} />
      </View>
      <Text className={`mt-1 text-[10px] font-semibold ${onDark ? 'text-white/80' : 'text-navy'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function WalletCard({ wallet, onPress, onFund, onWithdraw, onSend, className = '' }: WalletCardProps) {
  const s = walletVisual(wallet.type);
  const isMember = wallet.my_role && wallet.my_role !== 'owner';
  const primaryText = s.onDark ? 'text-white' : 'text-ink';
  const mutedText = s.onDark ? 'text-white/60' : 'text-muted';
  const showActions = Boolean(onFund || onWithdraw || onSend);

  return (
    <Pressable onPress={onPress} className={`active:opacity-95 ${className}`} style={shadow.card}>
      <LinearGradient
        colors={s.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 20 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View
              className={`mr-2.5 h-9 w-9 items-center justify-center rounded-2xl ${
                s.onDark ? 'bg-white/20' : 'bg-navy'
              }`}
            >
              <Ionicons name={s.icon} size={18} color={s.onDark ? colors.brandGlow : colors.white} />
            </View>
            <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
              {wallet.name}
            </Text>
          </View>
          <View className={`rounded-full px-2.5 py-1 ${s.onDark ? 'bg-white/20' : 'bg-white'}`}>
            <Text
              className={`text-[10px] font-bold tracking-widest ${s.onDark ? 'text-white' : 'text-navy'}`}
            >
              {s.label}
            </Text>
          </View>
        </View>

        <Text className={`mt-4 text-[11px] font-semibold uppercase tracking-wider ${mutedText}`}>
          Balance
        </Text>
        <Text className={`mt-0.5 text-3xl font-extrabold tracking-tight ${primaryText}`}>
          {formatMoney(wallet.balance)}
        </Text>

        {isMember ? (
          <View className="mt-2 flex-row items-center">
            <View className={`rounded-full px-2 py-0.5 ${s.onDark ? 'bg-white/20' : 'bg-lav-faint'}`}>
              <Text
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  s.onDark ? 'text-white/80' : 'text-muted'
                }`}
              >
                {wallet.my_role}
              </Text>
            </View>
            {wallet.owner ? (
              <Text className={`ml-2 text-xs ${mutedText}`} numberOfLines={1}>
                Owner: {wallet.owner.name}
              </Text>
            ) : null}
          </View>
        ) : null}

        {showActions ? (
          <View
            className={`mt-5 flex-row items-center justify-around border-t pt-4 ${
              s.onDark ? 'border-white/10' : 'border-navy/10'
            }`}
          >
            {onFund ? <MiniAction icon="add" label="Fund" onDark={s.onDark} onPress={onFund} /> : null}
            {onSend ? (
              <MiniAction icon="paper-plane" label="Send" onDark={s.onDark} onPress={onSend} />
            ) : null}
            {onWithdraw ? (
              <MiniAction icon="arrow-down" label="Withdraw" onDark={s.onDark} onPress={onWithdraw} />
            ) : null}
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}
