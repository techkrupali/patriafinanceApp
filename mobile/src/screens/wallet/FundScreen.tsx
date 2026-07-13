import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useFundingDetails } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</Text>
      <Text className="mt-1 text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}

export function FundScreen({ route }: RootScreenProps<'Fund'>) {
  const { walletId } = route.params;
  const { data, isLoading, error, refetch } = useFundingDetails(walletId);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!data) return;
    selection();
    await Clipboard.setStringAsync(data.account_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Screen>
      <Header title="Fund Wallet" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={() => refetch()} />
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row items-center rounded-2xl bg-lav-faint p-4">
            <Ionicons name="flash-outline" size={18} color={colors.brand} style={{ marginRight: 8 }} />
            <Text className="flex-1 text-[13px] leading-5 text-muted">
              Transfer to this account from any bank — your wallet credits instantly.
            </Text>
          </View>

          <Card className="mt-5 p-6">
            <DetailRow label="Bank" value={data.bank_name ?? '—'} />

            <Text className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Account number
            </Text>
            <View className="mt-2 flex-row items-center justify-between">
              <Text
                className="text-[30px] font-extrabold text-ink"
                style={{ letterSpacing: 3, fontVariant: ['tabular-nums'] }}
              >
                {data.account_number}
              </Text>
            </View>
            <Pressable
              onPress={() => void copy()}
              className={`mt-4 flex-row items-center justify-center rounded-2xl py-3.5 active:opacity-80 ${
                copied ? 'bg-success-soft' : 'bg-navy'
              }`}
            >
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={18}
                color={copied ? colors.brand : colors.white}
                style={{ marginRight: 8 }}
              />
              <Text className={`text-base font-semibold ${copied ? 'text-brand' : 'text-white'}`}>
                {copied ? 'Copied to clipboard' : 'Copy account number'}
              </Text>
            </Pressable>

            <View className="mt-6">
              <DetailRow label="Account name" value={data.account_name} />
            </View>
          </Card>

          <View className="mt-5 flex-row items-start rounded-2xl bg-success-soft p-4">
            <Ionicons name="information-circle-outline" size={18} color={colors.brand} style={{ marginRight: 8, marginTop: 1 }} />
            <Text className="flex-1 text-[13px] leading-5 text-brand">{data.note}</Text>
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}
