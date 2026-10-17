import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { TxnRow } from '../../components/TxnRow';
import { DateRangeFilter, withinRange, type DateRangeKey } from '../../components/DateRangeFilter';
import { colors, outline } from '../../theme';
import { formatMoney, humanizeType, timeLabel } from '../../lib/format';
import { walletVisual } from '../../lib/walletVisual';
import { selection, notifySuccess } from '../../lib/haptics';
import { useRaiseDispute, useActivity, useProjects, useWallets } from '../../api/hooks';
import type { DisputeCategory, PersonRef } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** picker categories drive a record list; 'other' is free-text only. */
const CATEGORIES: { value: DisputeCategory; label: string; picker: boolean }[] = [
  { value: 'transaction', label: 'Transaction', picker: true },
  { value: 'withdrawal', label: 'Withdrawal', picker: true },
  { value: 'project', label: 'Project', picker: true },
  { value: 'wallet', label: 'Wallet', picker: true },
  { value: 'vendor', label: 'Vendor', picker: true },
  { value: 'other', label: 'Other', picker: false },
];

const SEARCH_PLACEHOLDER: Record<string, string> = {
  transaction: 'Search recipient, amount, note…',
  withdrawal: 'Search a withdrawal…',
  project: 'Search project or vendor…',
  wallet: 'Search a wallet…',
  vendor: 'Search a vendor…',
};

const MAX_ROWS = 40;
const clampRef = (s: string) => s.slice(0, 100);

/** Generic selectable record row (projects / wallets / vendors). */
function SelectRow({
  icon,
  tile,
  title,
  subtitle,
  amount,
  onPress,
}: {
  icon: IconName;
  tile: string;
  title: string;
  subtitle?: string;
  amount?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-2 flex-row items-center rounded bg-white p-4 active:opacity-90"
      style={outline.card}
    >
      <View className={`mr-3.5 h-11 w-11 items-center justify-center rounded ${tile}`}>
        <Ionicons name={icon} size={22} color={colors.navy} />
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {amount ? <Text className="text-[15px] font-bold text-ink">{amount}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.faded} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

export function RaiseDisputeScreen({ navigation, route }: RootScreenProps<'RaiseDispute'>) {
  const prefillCategory = route.params?.category as DisputeCategory | undefined;
  const prefillRef = route.params?.reference ?? null;

  const [category, setCategory] = useState<DisputeCategory>(prefillCategory ?? 'transaction');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [search, setSearch] = useState('');
  const [selectedRef, setSelectedRef] = useState<string | null>(prefillRef);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(prefillRef);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const raise = useRaiseDispute();
  const activity = useActivity();
  const projects = useProjects();
  const wallets = useWallets();

  const cfg = CATEGORIES.find((c) => c.value === category)!;
  const q = search.trim().toLowerCase();

  const changeCategory = (c: DisputeCategory) => {
    selection();
    setCategory(c);
    setSelectedRef(null);
    setSelectedLabel(null);
    setSearch('');
    setError(null);
  };

  const select = (reference: string, label: string) => {
    selection();
    setSelectedRef(clampRef(reference));
    setSelectedLabel(label);
    if (!subject.trim()) setSubject(label.slice(0, 150));
    setError(null);
  };

  // ---- category-specific record sets, from real data, date + search filtered ----
  const txns = useMemo(() => {
    let list = activity.transactions;
    if (category === 'withdrawal') list = list.filter((t) => t.type.toLowerCase().includes('withdraw'));
    return list
      .filter((t) => withinRange(t.created_at, dateRange))
      .filter((t) => {
        if (!q) return true;
        return [t.description, humanizeType(t.type), t.reference, JSON.stringify(t.counterparty ?? '')]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice(0, MAX_ROWS);
  }, [activity.transactions, category, dateRange, q]);

  const projectItems = useMemo(
    () =>
      (projects.data ?? [])
        .filter((p) => withinRange(p.created_at, dateRange))
        .filter((p) => !q || [p.title, p.vendor?.name ?? ''].join(' ').toLowerCase().includes(q))
        .slice(0, MAX_ROWS),
    [projects.data, dateRange, q],
  );

  const walletItems = useMemo(
    () =>
      (wallets.data ?? [])
        .filter((w) => withinRange(w.created_at, dateRange))
        .filter((w) => !q || [w.name, w.type].join(' ').toLowerCase().includes(q))
        .slice(0, MAX_ROWS),
    [wallets.data, dateRange, q],
  );

  const vendorItems = useMemo(() => {
    const map = new Map<number, PersonRef>();
    for (const p of projects.data ?? []) if (p.vendor) map.set(p.vendor.id, p.vendor);
    return [...map.values()].filter((v) => !q || v.name.toLowerCase().includes(q)).slice(0, MAX_ROWS);
  }, [projects.data, q]);

  const listLoading =
    category === 'transaction' || category === 'withdrawal'
      ? activity.isLoading
      : category === 'project' || category === 'vendor'
        ? projects.isLoading
        : wallets.isLoading;

  const count =
    category === 'transaction' || category === 'withdrawal'
      ? txns.length
      : category === 'project'
        ? projectItems.length
        : category === 'wallet'
          ? walletItems.length
          : vendorItems.length;

  const submit = () => {
    setError(null);
    if (cfg.picker && !selectedRef) {
      setError(`Select a ${cfg.label.toLowerCase()} to dispute.`);
      return;
    }
    if (subject.trim().length < 4) {
      setError('Please add a short subject (at least 4 characters).');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe what happened in a little more detail.');
      return;
    }
    raise.mutate(
      {
        subject: subject.trim(),
        category,
        reference: selectedRef?.trim() || null,
        description: description.trim(),
      },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Raise a dispute" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[15px] leading-5 text-muted">
          Pick what went wrong, find the exact record with the filters, then tell us what happened.
        </Text>

        {/* Category */}
        <Text className="mt-6 text-[13px] font-semibold text-muted">Category</Text>
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <Pressable
                key={c.value}
                onPress={() => changeCategory(c.value)}
                className={`rounded px-4 py-2.5 active:opacity-90 ${active ? 'bg-navy' : 'bg-lav'}`}
              >
                <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Record selection (picker categories) */}
        {cfg.picker ? (
          selectedRef ? (
            <View className="mt-4 flex-row items-center rounded bg-success-soft p-4">
              <Ionicons name="checkmark-circle" size={20} color={colors.brand} style={{ marginRight: 10 }} />
              <View className="flex-1 pr-2">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-brand">
                  Selected {cfg.label}
                </Text>
                <Text className="mt-0.5 text-[14px] font-semibold text-ink" numberOfLines={1}>
                  {selectedLabel}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  selection();
                  setSelectedRef(null);
                  setSelectedLabel(null);
                }}
                hitSlop={6}
                className="rounded bg-white px-3 py-1.5 active:opacity-80"
              >
                <Text className="text-[12px] font-bold text-navy">Change</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Common date/time filter */}
              <Text className="mt-6 text-[13px] font-semibold text-muted">When</Text>
              <View className="mt-2">
                <DateRangeFilter value={dateRange} onChange={setDateRange} />
              </View>

              {/* Search */}
              <Input
                icon="search-outline"
                value={search}
                onChangeText={setSearch}
                placeholder={SEARCH_PLACEHOLDER[category] ?? 'Search…'}
                autoCapitalize="none"
                containerClassName="mt-4"
              />

              {/* Results */}
              {listLoading ? (
                <View className="mt-8 items-center">
                  <ActivityIndicator color={colors.navy} />
                </View>
              ) : count === 0 ? (
                <View className="mt-6 flex-row items-start rounded bg-lav-faint p-4">
                  <Ionicons name="funnel-outline" size={16} color={colors.muted} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text className="flex-1 text-[13px] text-muted">
                    No {cfg.label.toLowerCase()} records match these filters. Try a wider date range or a
                    different search.
                  </Text>
                </View>
              ) : (
                <View className="mt-2">
                  {(category === 'transaction' || category === 'withdrawal') &&
                    txns.map((t) => (
                      <View key={t.id} className="mt-2">
                        <TxnRow
                          txn={t}
                          walletName={activity.walletNames.get(t.wallet_id)}
                          onPress={() =>
                            select(
                              t.reference,
                              `${t.description || humanizeType(t.type)} · ${formatMoney(t.amount)}`,
                            )
                          }
                        />
                      </View>
                    ))}

                  {category === 'project' &&
                    projectItems.map((p) => (
                      <SelectRow
                        key={p.id}
                        icon="briefcase-outline"
                        tile="bg-lav"
                        title={p.title}
                        subtitle={[p.vendor?.name ? `Vendor: ${p.vendor.name}` : null, timeLabel(p.created_at)]
                          .filter(Boolean)
                          .join(' · ')}
                        amount={formatMoney(p.budget)}
                        onPress={() => select(`Project #${p.id} — ${p.title}`, p.title)}
                      />
                    ))}

                  {category === 'wallet' &&
                    walletItems.map((w) => (
                      <SelectRow
                        key={w.id}
                        icon={walletVisual(w.type).icon}
                        tile="bg-lav-soft"
                        title={w.name}
                        subtitle={humanizeType(w.type)}
                        amount={formatMoney(w.balance)}
                        onPress={() => select(`${w.name} — wallet #${w.id}`, w.name)}
                      />
                    ))}

                  {category === 'vendor' &&
                    vendorItems.map((v) => (
                      <SelectRow
                        key={v.id}
                        icon="person-outline"
                        tile="bg-lav"
                        title={v.name}
                        subtitle="Vendor you've worked with"
                        onPress={() => select(`${v.name} — vendor #${v.id}`, v.name)}
                      />
                    ))}

                  {count >= MAX_ROWS ? (
                    <Text className="mt-3 text-center text-[12px] text-faded">
                      Showing the first {MAX_ROWS}. Refine with the filters above.
                    </Text>
                  ) : null}
                </View>
              )}
            </>
          )
        ) : (
          /* 'Other' — no record picker, optional free-text reference */
          <Input
            label="Reference (Optional)"
            icon="barcode-outline"
            value={selectedRef ?? ''}
            onChangeText={(t) => setSelectedRef(t)}
            placeholder="Any reference you want to cite"
            containerClassName="mt-6"
          />
        )}

        {/* Describe + submit */}
        <Input
          label="Subject"
          icon="pricetag-outline"
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. Transfer not received"
          maxLength={150}
          containerClassName="mt-6"
        />

        <Input
          label="What Happened?"
          icon="document-text-outline"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the problem in detail…"
          multiline
          numberOfLines={5}
          maxLength={2000}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
          containerClassName="mt-6"
        />

        <ErrorText message={error} className="mt-4" />

        <Button
          title="Submit dispute"
          icon="send"
          onPress={submit}
          loading={raise.isPending}
          className="mt-6"
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
