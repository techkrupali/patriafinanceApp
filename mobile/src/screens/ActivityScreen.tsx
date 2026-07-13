import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Chip } from '../components/Chip';
import { TxnRow } from '../components/TxnRow';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { colors } from '../theme';
import { useActivity } from '../api/hooks';
import { dayLabel } from '../lib/format';
import type { Transaction } from '../api/types';

type Filter = 'all' | 'credit' | 'debit';

export function ActivityScreen() {
  const { transactions, walletNames, isLoading, error, refetch, isRefetching } = useActivity();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = transactions.filter((t) => {
      if (filter !== 'all' && t.direction !== filter) return false;
      if (!q) return true;
      return (t.description ?? '').toLowerCase().includes(q) || t.reference.toLowerCase().includes(q);
    });

    const groups: { label: string; items: Transaction[] }[] = [];
    for (const t of filtered) {
      const label = dayLabel(t.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.items.push(t);
      } else {
        groups.push({ label, items: [t] });
      }
    }
    return groups;
  }, [transactions, filter, search]);

  return (
    <Screen>
      <View className="px-5 pt-4">
        <Text className="text-[26px] font-semibold tracking-tight text-ink">Activity</Text>

        {/* Search */}
        <View className="mt-4 flex-row items-center rounded-2xl bg-lav-faint px-4" style={{ minHeight: 50 }}>
          <Ionicons name="search" size={18} color={colors.faded} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search description or reference…"
            placeholderTextColor={colors.faded}
            className="flex-1 py-3 text-[15px] text-ink"
          />
        </View>

        {/* Filter chips */}
        <View className="mt-3 flex-row" style={{ gap: 8 }}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Money In" active={filter === 'credit'} onPress={() => setFilter('credit')} />
          <Chip label="Money Out" active={filter === 'debit'} onPress={() => setFilter('debit')} />
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
        >
          {sections.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              message={
                search || filter !== 'all'
                  ? 'No transactions match your filters.'
                  : 'Transactions across all your wallets will appear here.'
              }
              icon="swap-vertical-outline"
            />
          ) : (
            sections.map((section) => (
              <View key={section.label} className="mb-5">
                <Text className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                  {section.label}
                </Text>
                <View style={{ gap: 10 }}>
                  {section.items.map((t) => (
                    <TxnRow key={t.id} txn={t} walletName={walletNames.get(t.wallet_id)} />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
