import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useDirectory } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { TRADES, tradeLabel } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { VendorListing } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const FILTERS = TRADES.filter((t) => t.value !== 'other').map((t) => ({ value: t.value, label: t.plural }));

/** One directory row: monogram, name with a tick when verified, trade and town, stars. */
function VendorRow({ v, onPress, last }: { v: VendorListing; onPress: () => void; last: boolean }) {
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button" accessibilityLabel={v.business_name}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
        <PtAvatar initials={v.initials} uri={v.logo_url} size={48} tone="gold" />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ flexShrink: 1, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
              {v.business_name}
            </Text>
            {v.verified ? <Feather name="check" size={15} color={pt.brand} accessibilityLabel="Verified" /> : null}
          </View>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
            {tradeLabel(v.category)}{v.location ? ` · ${v.location}` : ''}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
            {v.rating ? (
              <>
                <Text style={{ color: pt.gold500 }}>★ </Text>
                <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{v.rating.toFixed(1)}</Text> ({v.reviews} review{v.reviews === 1 ? '' : 's'})
              </>
            ) : v.verified ? (
              'New on Patriai · verified'
            ) : (
              'Not verified yet'
            )}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * VND-01 "Find a vendor": search, trade, near a town, verified only. Opened
 * from a project it carries that project, so a profile can be added to it.
 */
export function VendorDirectoryScreen({ navigation, route }: RootScreenProps<'VendorDirectory'>) {
  const projectId = route.params?.projectId;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState(route.params?.category ?? 'building');
  const [near, setNear] = useState(route.params?.near ?? '');
  const [verified, setVerified] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nearDraft, setNearDraft] = useState(near);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useDirectory(debounced, category, near, verified);
  const vendors = query.data?.pages.flatMap((p) => p.vendors) ?? [];
  const trade = TRADES.find((t) => t.value === category)?.label.toLowerCase() ?? 'vendor';

  return (
    <PtPageScreen
      title="Find a vendor"
      subtitle={verified ? 'Verified businesses' : 'All businesses'}
      onBack={() => navigation.goBack()}
      right={
        <Pressable
          onPress={() => { selection(); navigation.navigate('Tabs', { screen: 'Steward', params: { ask: `Find a ${trade === 'building' ? 'builder' : trade} near ${near || 'me'}` } }); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Ask Steward"
        >
          <Feather name="shield" size={22} color={pt.ink} />
        </Pressable>
      }
      gap={14}
    >
      <View style={{ height: 52, borderRadius: ptRadius.sm, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
        <Feather name="search" size={18} color={pt.inkMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Tilers, caterers, schools…"
          placeholderTextColor={pt.inkSubtle}
          accessibilityLabel="Search vendors"
          style={{ flex: 1, minWidth: 0, fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }}
        />
      </View>
      <PtPills options={FILTERS} value={category} onChange={(v) => setCategory(category === v ? '' : v)} />
      <Pressable onPress={() => { selection(); setNearDraft(near); setFiltersOpen(true); }} accessibilityRole="button" accessibilityLabel="Filters">
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{near ? `Near ${near}` : 'Anywhere'}</Text>
          {` · ${verified ? 'Verified only' : 'Everyone'} · Any price`}
        </Text>
      </Pressable>

      {query.isLoading || query.error ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : vendors.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>No one found</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center' }}>
            Try another trade, or search further than {near || 'here'}.
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
          {vendors.map((v, i) => (
            <VendorRow key={v.id} v={v} last={i === vendors.length - 1} onPress={() => navigation.navigate('VendorProfile', { profileId: v.id, projectId })} />
          ))}
        </View>
      )}
      {query.hasNextPage ? <PtButton title="Show more" variant="ghost" onPress={() => void query.fetchNextPage()} loading={query.isFetchingNextPage} /> : null}

      <PtSheet
        visible={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
        footer={<PtButton title="Show vendors" onPress={() => { setNear(nearDraft.trim()); setFiltersOpen(false); }} />}
      >
        <PtField label="Near" value={nearDraft} onChangeText={setNearDraft} placeholder="Nsukka" maxLength={60} />
        <PtSwitchRow title="Verified only" subtitle="Families can only pay verified businesses." value={verified} onChange={setVerified} />
      </PtSheet>
    </PtPageScreen>
  );
}
