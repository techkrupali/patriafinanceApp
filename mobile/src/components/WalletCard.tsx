import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet } from '../api/types';
import { colors, shadow } from '../theme';
import { formatMoney } from '../lib/format';
import { selection } from '../lib/haptics';
import { walletVisual } from '../lib/walletVisual';

interface WalletCardProps {
  wallet: Wallet;
  onPress?: () => void;
  /** Kept for API compatibility; the treasury row routes actions to the detail screen. */
  onFund?: () => void;
  onWithdraw?: () => void;
  onSend?: () => void;
  className?: string;
}

function subtitleFor(wallet: Wallet): string {
  if (wallet.my_role && wallet.my_role !== 'owner') {
    const owner = wallet.owner?.name ? ` · ${wallet.owner.name}` : '';
    return `${wallet.my_role.replace('_', ' ')}${owner}`;
  }
  const map: Record<string, string> = {
    main: 'Primary operating account',
    shared: 'Shared wallet',
    savings: 'Savings',
    goal: 'Goal-linked treasury',
    project: 'Project escrow',
    emergency: 'Emergency fund',
    giving: 'Giving',
    joint: 'Joint wallet',
    child: 'Child wallet',
    spending: 'Spending',
  };
  return map[wallet.type] ?? 'Wallet';
}

/** Soft tinted icon tile per wallet type (Stitch treasury list treatment). */
function tileVisual(wallet: Wallet): { bg: string; fg: string } {
  if (wallet.type === 'main') return { bg: 'rgba(255,204,0,0.18)', fg: colors.goldDeep };
  const s = walletVisual(wallet.type);
  // Light gradients (project, child) get the soft secondary-container tint.
  if (!s.onDark) return { bg: 'rgba(199,223,255,0.35)', fg: colors.muted };
  // Dark gradients: tint from the light stop, icon in the deep stop.
  return { bg: `${s.gradient[1]}26`, fg: s.gradient[0] };
}

/** Bottom-right status eyebrow, per the design ("Standard" / "LOCKED" / "Goal Active" / "Shared"). */
function statusFor(wallet: Wallet, hasTarget: boolean): { label: string; color: string } {
  const st = (wallet.status || 'active').toLowerCase();
  if (st !== 'active') return { label: st.toUpperCase(), color: colors.danger };
  if (hasTarget) return { label: 'Goal Active', color: colors.muted };
  if (wallet.type === 'main') return { label: 'Standard', color: colors.brand };
  if (wallet.type === 'shared' || wallet.type === 'joint') return { label: 'Shared', color: colors.brand };
  return { label: 'Active', color: colors.brand };
}

export function WalletCard({ wallet, onPress, className = '' }: WalletCardProps) {
  const s = walletVisual(wallet.type);
  const tile = tileVisual(wallet);

  const target = parseFloat(wallet.target_amount ?? '');
  const balanceNum = parseFloat(wallet.balance || '0');
  const hasTarget = Number.isFinite(target) && target > 0;
  const pct = hasTarget ? Math.min(Math.floor((balanceNum / target) * 100), 100) : 0;
  const status = statusFor(wallet, hasTarget);

  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          selection();
          onPress();
        }
      }}
      className={`rounded-2xl bg-white p-4 active:opacity-90 ${className}`}
      style={shadow.soft}
    >
      <View className="flex-row items-center">
        <View className="h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: tile.bg }}>
          <Ionicons name={s.icon} size={24} color={tile.fg} />
        </View>

        <View className="ml-4 flex-1 pr-2">
          <Text className="text-[16px] font-extrabold tracking-tight text-ink" numberOfLines={1}>
            {wallet.name}
          </Text>
          <Text className="mt-0.5 text-xs font-medium capitalize text-muted" numberOfLines={1}>
            {subtitleFor(wallet)}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[15px] font-extrabold tracking-tight text-ink">
            {formatMoney(wallet.balance)}
          </Text>
          <Text className="mt-0.5 text-[10px] font-bold" style={{ color: status.color }}>
            {status.label}
          </Text>
        </View>
      </View>

      {hasTarget ? (
        <View className="mt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">Progress</Text>
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">{pct}%</Text>
          </View>
          <View className="mt-1.5 h-2 overflow-hidden rounded-full bg-lav-soft">
            <View
              className="h-2 rounded-full"
              style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: '#FFCC00' }}
            />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
