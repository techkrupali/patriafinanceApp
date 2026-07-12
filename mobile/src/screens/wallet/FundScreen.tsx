import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { LoadError } from '../../components/LoadError';
import { useFundingDetails } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

export function FundScreen({ route }: RootScreenProps<'Fund'>) {
  const { walletId } = route.params;
  const { data, isLoading, error, refetch } = useFundingDetails(walletId);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.account_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen>
      <Header title="Fund Wallet" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#001736" />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={() => refetch()} />
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
          <Text className="text-sm leading-6 text-muted">
            Transfer to this account from any bank — wallet credits instantly.
          </Text>

          <Card className="mt-5 p-6">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">
              Bank
            </Text>
            <Text className="mt-1 text-lg font-semibold text-ink">
              {data.bank_name ?? '—'}
            </Text>

            <Text className="mt-5 text-[11px] font-bold uppercase tracking-widest text-muted">
              Account number
            </Text>
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-3xl font-bold tracking-wider text-ink">
                {data.account_number}
              </Text>
              <Pressable
                onPress={() => void copy()}
                className={`rounded-full px-4 py-2 ${copied ? 'bg-success' : 'bg-lav'} active:opacity-80`}
              >
                <Text className={`text-xs font-bold ${copied ? 'text-brand' : 'text-navy'}`}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </Text>
              </Pressable>
            </View>

            <Text className="mt-5 text-[11px] font-bold uppercase tracking-widest text-muted">
              Account name
            </Text>
            <Text className="mt-1 text-base font-semibold text-ink">{data.account_name}</Text>
          </Card>

          <View className="mt-5 rounded-2xl bg-success p-4">
            <Text className="text-[13px] leading-5 text-brand">{data.note}</Text>
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}
