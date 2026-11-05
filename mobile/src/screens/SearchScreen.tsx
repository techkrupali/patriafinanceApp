import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { pt, ptFont, ptRadius } from '../theme';
import { api } from '../api/client';
import { PtCard, PtIconTile, PtSectionTitle } from '../components/pt/PtList';
import { PtChip } from '../components/pt/PtChip';
import { PtRing } from '../components/pt/PtRing';
import { formatNaira } from '../lib/format';
import { selection } from '../lib/haptics';
import type { RootScreenProps } from '../navigation/types';

interface SearchData {
  q: string;
  wallets: { id: number; name: string; type: string; line: string; percent: number | null; balance: string }[];
  transactions: { kind: 'request' | 'transaction'; id: number; title: string; line: string; amount: string; direction: 'credit' | 'debit'; status: 'waiting' | 'pending' | null }[];
  rules: { id: number; name: string; line: string; enabled: boolean }[];
}

/** The query's letters highlighted, as the prototype marks "School". */
function Highlight({ text, q, style }: { text: string; q: string; style: object }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <Text style={style} numberOfLines={1}>{text}</Text>;
  return (
    <Text style={style} numberOfLines={1}>
      {text.slice(0, i)}
      <Text style={{ backgroundColor: '#FCEBCC' }}>{text.slice(i, i + q.length)}</Text>
      {text.slice(i + q.length)}
    </Text>
  );
}

function Row({ onPress, children, last, label }: { onPress: () => void; children: React.ReactNode; last?: boolean; label: string }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>{children}</View>
    </Pressable>
  );
}

/**
 * HOM-05 Search Patriai: type, and wallets, money in and out (requests still
 * waiting too) and rules that match — only what you can already see.
 */
export function SearchScreen({ navigation }: RootScreenProps<'Search'>) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const input = useRef<TextInput>(null);
  // Ask once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const search = useQuery({
    queryKey: ['search', q] as const,
    queryFn: () => api<SearchData>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    placeholderData: (prev) => prev,
  });
  const d = q.length >= 2 ? search.data : undefined;
  const empty = d && !d.wallets.length && !d.transactions.length && !d.rules.length;
  const title = { fontFamily: ptFont.semibold, fontSize: 16, lineHeight: 22, color: pt.ink };
  const sub = { fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted };

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 8 }}>
      <StatusBar style="dark" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 8 }}>
        <View style={{ flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: ptRadius.sm, borderWidth: 2, borderColor: pt.brand, backgroundColor: pt.raised, paddingHorizontal: 14 }}>
          <Feather name="search" size={18} color={pt.inkMuted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder="Search Patriai"
            placeholderTextColor={pt.inkSubtle}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search Patriai"
            style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 17, color: pt.ink, paddingVertical: 0 }}
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
              <Feather name="x-circle" size={18} color={pt.inkSubtle} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button">
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, color: pt.brand }}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        {q.length < 2 ? (
          <Text style={[sub, { textAlign: 'center', paddingTop: 24 }]}>Search your wallets, money in and out, and rules.</Text>
        ) : search.isLoading && !d ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
        ) : search.error && !d ? (
          <Text style={[sub, { textAlign: 'center', color: pt.danger, paddingTop: 24 }]}>{(search.error as Error).message}</Text>
        ) : empty ? (
          <Text style={[sub, { textAlign: 'center', paddingTop: 24 }]}>{`Nothing matches “${q}”. Try a name, a wallet or an amount.`}</Text>
        ) : d ? (
          <>
            {d.wallets.length ? (
              <View style={{ gap: 8 }}>
                <PtSectionTitle title="Wallets" />
                <PtCard>
                  {d.wallets.map((w, i) => (
                    <Row key={w.id} label={w.name} last={i === d.wallets.length - 1} onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}>
                      {w.percent !== null ? (
                        <PtRing percent={w.percent} size={44} stroke={6} />
                      ) : (
                        <PtIconTile size={44} round>
                          <Feather name="briefcase" size={18} color={pt.brand} />
                        </PtIconTile>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Highlight text={w.name} q={q} style={title} />
                        <Text style={sub}>{w.line}</Text>
                      </View>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(w.balance)}</Text>
                    </Row>
                  ))}
                </PtCard>
              </View>
            ) : null}

            {d.transactions.length ? (
              <View style={{ gap: 8 }}>
                <PtSectionTitle title="Transactions" />
                <PtCard>
                  {d.transactions.map((t, i) => {
                    const credit = t.direction === 'credit';
                    return (
                      <Row
                        key={`${t.kind}-${t.id}`}
                        label={t.title}
                        last={i === d.transactions.length - 1}
                        onPress={() => (t.kind === 'request' ? navigation.navigate('ApprovalDetail', { approvalId: t.id }) : navigation.navigate('TransactionDetail', { id: t.id }))}
                      >
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: credit ? pt.brandSoft : pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name={credit ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={credit ? pt.brand : pt.inkMuted} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Highlight text={t.title} q={q} style={title} />
                          <Text style={sub} numberOfLines={1}>{t.line}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: credit ? pt.brand : pt.ink }}>{`${credit ? '+' : '−'}${formatNaira(t.amount)}`}</Text>
                          {t.status === 'waiting' ? <PtChip label="Waiting" tone="warning" icon="clock" /> : t.status === 'pending' ? <PtChip label="Pending" tone="neutral" icon="clock" /> : null}
                        </View>
                      </Row>
                    );
                  })}
                </PtCard>
              </View>
            ) : null}

            {d.rules.length ? (
              <View style={{ gap: 8 }}>
                <PtSectionTitle title="Rules" />
                <PtCard>
                  {d.rules.map((r, i) => (
                    <Row key={r.id} label={r.name} last={i === d.rules.length - 1} onPress={() => navigation.navigate('RuleDetail', { ruleId: r.id })}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Highlight text={r.name} q={q} style={title} />
                        <Highlight text={r.line} q={q} style={sub} />
                      </View>
                      {!r.enabled ? <PtChip label="Paused" /> : null}
                    </Row>
                  ))}
                </PtCard>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
