import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useCreateListing, useListingCandidates } from '../../api/proposals';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * VLS-01 Show off your work: a finished project's title, its photos, a cost
 * range and how long it took, "Verified on Patriai · Paid through 6 milestones,
 * all approved" — and the family is asked before it's published.
 */
export function ListProjectScreen({ navigation }: RootScreenProps<'ListProject'>) {
  const q = useListingCandidates();
  const create = useCreateListing();
  const [pid, setPid] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = q.data ?? [];
  const p = list.find((x) => x.id === pid) ?? list[0];

  useEffect(() => {
    if (!p) return;
    setTitle(p.title);
    setChosen(p.photos.slice(0, 6).map((x) => x.url));
    // Only when the project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  if (!q.data) {
    return (
      <PtPageScreen title="Show off your work" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  if (!p) {
    return (
      <PtPageScreen title="Show off your work" subtitle="Adds to your public profile" onBack={() => navigation.goBack()}>
        <PtNote>When a project you built through Patriai is finished and paid, you can show it here — with the family's yes.</PtNote>
      </PtPageScreen>
    );
  }

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError('Give it a title.');
    if (!chosen.length) return setError('Choose at least one photo.');
    create.mutate(
      { project_id: p.id, title: title.trim(), photos: p.photos.filter((x) => chosen.includes(x.url)), cost_min: min || undefined, cost_max: max || undefined },
      {
        onSuccess: () => {
          showAlert('Asked', `We asked the ${p.family ?? 'family'}. It goes on your profile when they agree.`);
          navigation.goBack();
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Show off your work"
      subtitle="Adds to your public profile"
      onBack={() => navigation.goBack()}
      footer={<PtButton title={`Ask the ${p.family ?? 'family'} and publish`} loading={create.isPending} onPress={submit} />}
    >
      {list.length > 1 ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Project</PtGroupLabel>
          <PtPills options={list.map((x) => ({ value: x.id, label: x.title }))} value={p.id} onChange={(v) => setPid(Number(v))} />
        </View>
      ) : null}
      <PtField label="Title" value={title} onChangeText={setTitle} maxLength={120} />
      {p.photos.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {p.photos.map((x) => {
            const on = chosen.includes(x.url);
            return (
              <Pressable
                key={x.url}
                onPress={() => { selection(); setChosen((l) => (on ? l.filter((u) => u !== x.url) : [...l, x.url])); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={x.caption ?? 'Photo'}
                style={{ width: '31.5%', aspectRatio: 1, borderRadius: ptRadius.sm, overflow: 'hidden', backgroundColor: pt.sunken, borderWidth: 3, borderColor: on ? pt.brand : 'transparent' }}
              >
                <Image source={{ uri: x.url }} style={{ width: '100%', height: '100%', opacity: on ? 1 : 0.5 }} resizeMode="cover" />
                {x.caption ? (
                  <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(14,26,22,0.6)', borderRadius: 6, paddingHorizontal: 6 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 10, color: '#FFFFFF' }}>{x.caption}</Text>
                  </View>
                ) : null}
                {on ? (
                  <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <PtNote tone="attention">This project has no photos from its milestones.</PtNote>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <PtField label="Cost from" prefix="₦" value={groupAmountInput(min)} onChangeText={(t) => setMin(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="15,000,000" />
        </View>
        <View style={{ flex: 1 }}>
          <PtField label="to" prefix="₦" value={groupAmountInput(max)} onChangeText={(t) => setMax(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="20,000,000" />
        </View>
      </View>
      <PtPanel>
        <PtReviewRow label="Took" value={`${p.months} month${p.months === 1 ? '' : 's'}`} sub={p.location} />
        <PtSwitchRow title="Verified on Patriai" subtitle={`Paid through ${p.milestones} milestones${p.all_approved ? ', all approved' : ''}`} value onChange={() => undefined} disabled />
        <PtSwitchRow title="Ask the family before publishing" subtitle="They'll get a request to agree" value onChange={() => undefined} disabled />
      </PtPanel>
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtPageScreen>
  );
}
