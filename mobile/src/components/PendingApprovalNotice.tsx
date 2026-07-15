import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from './Button';
import { Card } from './Card';
import { colors, gradients } from '../theme';
import { formatMoney } from '../lib/format';
import { notifySuccess } from '../lib/haptics';
import type { ApprovalRequest } from '../api/types';

interface PendingApprovalNoticeProps {
  approval: ApprovalRequest;
  onViewApprovals: () => void;
  onDone: () => void;
}

/**
 * Distinct "queued for approval" success state (vs the normal sent receipt).
 * Shown when a withdrawal/transfer needs sign-off before it executes.
 */
export function PendingApprovalNotice({ approval, onViewApprovals, onDone }: PendingApprovalNoticeProps) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    notifySuccess();
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const required = approval.required_approvals || 1;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
      <Animated.View className="items-center" style={{ opacity }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <View className="h-28 w-28 items-center justify-center rounded-full bg-lav-soft">
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                height: 84,
                width: 84,
                borderRadius: 42,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="hourglass-outline" size={42} color={colors.brandGlow} />
            </LinearGradient>
          </View>
        </Animated.View>
        <Text className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Submitted for approval</Text>
        <Text className="mt-2 text-center text-sm text-muted">
          {formatMoney(approval.amount)} is on hold. {required} approver{required === 1 ? '' : 's'} must approve
          before it goes through.
        </Text>
      </Animated.View>

      <Card className="mt-8">
        <View className="flex-row items-center justify-between py-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Amount</Text>
          <Text className="text-[15px] font-semibold text-ink">{formatMoney(approval.amount)}</Text>
        </View>
        {approval.wallet?.name ? (
          <View className="mt-2 flex-row items-center justify-between py-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Wallet</Text>
            <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
              {approval.wallet.name}
            </Text>
          </View>
        ) : null}
        <View className="mt-2 flex-row items-center justify-between py-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Status</Text>
          <View className="flex-row items-center rounded-full bg-lav-faint px-2.5 py-1">
            <Ionicons name="time-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">Pending</Text>
          </View>
        </View>
      </Card>

      <Button title="View approvals" icon="arrow-forward" onPress={onViewApprovals} className="mt-8" />
      <Button title="Done" variant="ghost" onPress={onDone} className="mt-2" />
    </ScrollView>
  );
}
