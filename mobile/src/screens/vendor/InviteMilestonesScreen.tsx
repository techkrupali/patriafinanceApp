import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAcceptProject, useAskChange, useClearChange, useSendChanges, useUploadProjectDocument } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtField } from '../../components/pt/PtField';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtText } from '../../components/pt/PtText';
import { DoneHero, FileRow, LoadingBlock, TextArea } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { milestoneDates, namesList } from '../../lib/projects';
import { pickFile } from '../../lib/upload';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** INV-V2 "Milestones": accept them all, or ask for a change on any of them. */
export function InviteMilestonesScreen({ navigation, route }: RootScreenProps<'InviteMilestones'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const accept = useAcceptProject();
  const sendChanges = useSendChanges();
  const d = query.data;

  if (!d) {
    return (
      <PtPageScreen title="Milestones" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }
  const list = d.milestones.filter((m) => m.status !== 'proposed' && m.status !== 'cancelled');
  const changed = list.filter((m) => m.change_request?.by === 'vendor');
  const invited = d.project.vendor_status === 'invited';

  const go = () => {
    if (changed.length) {
      sendChanges.mutate(projectId, {
        onSuccess: () => navigation.replace('ChangesSent', { projectId }),
        onError: (e) => showAlert('Not sent', (e as Error).message),
      });
      return;
    }
    accept.mutate(projectId, {
      onSuccess: () => {
        showAlert('Project accepted', `${d.project.title} has started. Submit photos when each milestone is done.`);
        // Back from the project goes home, not to the answered invitation.
        navigation.reset({ index: 1, routes: [{ name: 'VendorTabs' }, { name: 'VendorProject', params: { projectId } }] });
      },
      onError: (e) => showAlert('Could not accept', (e as Error).message),
    });
  };

  return (
    <PtPageScreen
      title="Milestones"
      subtitle={d.project.title}
      onBack={() => navigation.goBack()}
      footer={
        invited ? (
          <PtButton
            title={changed.length ? `Send back with ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Accept them all'}
            onPress={go}
            loading={accept.isPending || sendChanges.isPending}
          />
        ) : null
      }
    >
      <PtText color={pt.inkMuted}>Accept them all, or ask for a change on any milestone. The family has to agree to changes.</PtText>
      <PtPanel>
        {list.map((m, i) => {
          const asked = m.change_request?.by === 'vendor';
          const dates = milestoneDates(m, 'months');
          return (
            <Pressable key={m.id} onPress={invited ? () => { selection(); navigation.navigate('AskChange', { projectId, milestoneId: m.id }); } : undefined} accessibilityRole="button" accessibilityLabel={`${m.title}${asked ? ', change asked' : ''}`}>
              <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{m.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
                    {[dates, formatNaira(m.amount)].filter(Boolean).join(' · ')}
                    {asked && m.change_request?.amount ? ` → ${formatNaira(m.change_request.amount)}` : ''}
                  </Text>
                </View>
                {asked ? <PtChip label="Change asked" tone="warning" icon="clock" /> : <PtChip label="OK" tone="success" icon="check" />}
              </View>
            </Pressable>
          );
        })}
      </PtPanel>
      {changed[0] ? (
        <Pressable onPress={() => { selection(); navigation.navigate('AskChange', { projectId, milestoneId: changed[0].id }); }} accessibilityRole="button">
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>View your {changed[0].title} change</Text>
        </Pressable>
      ) : null}
      {!invited ? <PtText color={pt.inkMuted}>You've already answered this invitation.</PtText> : null}
    </PtPageScreen>
  );
}

/** INV-V3 "Ask for a change": a different amount or dates on one milestone, why, and a quote. */
export function AskChangeScreen({ navigation, route }: RootScreenProps<'AskChange'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const ask = useAskChange();
  const clear = useClearChange();
  const upload = useUploadProjectDocument(projectId);
  const m = query.data?.milestones.find((x) => x.id === milestoneId);
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [quote, setQuote] = useState<{ id: number; name: string; url: string } | null>(null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (!m) return;
    const c = m.change_request?.by === 'vendor' ? m.change_request : null;
    setAmount(c?.amount ? String(Math.round(Number(c.amount))) : '');
    setStart(c?.starts_on ?? m.starts_on ?? null);
    setEnd(c?.due_date ?? m.due_date);
    setWhy(c?.why ?? '');
    setQuote(c?.attachment?.id ? { id: c.attachment.id, name: c.attachment.name, url: c.attachment.url } : null);
  }, [m]);

  if (!query.data || !m) {
    return (
      <PtPageScreen title="Ask for a change" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const amountChanged = amount !== '' && Number(amount) !== Math.round(Number(m.amount));
  const startChanged = start !== (m.starts_on ?? null);
  const endChanged = end !== m.due_date;
  const ok = amountChanged || startChanged || endChanged;

  const attach = async () => {
    const asset = await pickFile('library');
    if (!asset) return;
    upload.mutate(
      { asset, kind: 'other', name: `${m.title} quote` },
      { onSuccess: (r) => setQuote({ id: r.document.id, name: r.document.name, url: r.document.url }), onError: (e) => showAlert('Could not attach', (e as Error).message) },
    );
  };

  const save = () =>
    ask.mutate(
      {
        milestoneId,
        amount: amountChanged ? amount : undefined,
        starts_on: startChanged && start ? start : undefined,
        due_date: endChanged && end ? end : undefined,
        why: why.trim() || undefined,
        attachment_id: quote?.id,
      },
      { onSuccess: () => navigation.goBack(), onError: (e) => showAlert('Could not save', (e as Error).message) },
    );

  const year = new Date().getFullYear();
  return (
    <PtPageScreen
      title="Ask for a change"
      subtitle={m.title}
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton title="Save change" onPress={save} disabled={!ok} loading={ask.isPending} />
          {m.change_request?.by === 'vendor' ? (
            <PtButton title="Keep it as the family asked" variant="ghost" onPress={() => clear.mutate(milestoneId, { onSuccess: () => navigation.goBack() })} loading={clear.isPending} />
          ) : null}
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PtField label="Family asked" prefix="₦" value={groupAmountInput(String(Math.round(Number(m.amount))))} editable={false} />
        </View>
        <View style={{ flex: 1 }}>
          <PtField label="You propose" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t).split('.')[0])} keyboardType="number-pad" placeholder="Same" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PtField label="Starts" value={start ? formatYmd(start) : ''} placeholder="Pick" onPressBox={() => setPicking('start')} />
        </View>
        <View style={{ flex: 1 }}>
          <PtField label="Ends" value={end ? formatYmd(end) : ''} placeholder="Pick" onPressBox={() => setPicking('end')} />
        </View>
      </View>
      <TextArea label="Why" value={why} onChange={setWhy} placeholder="Long-span aluminium sheets went up about 8% this month. Updated quote attached." maxLength={500} />
      <PtPanel>
        {quote ? (
          <FileRow title={quote.name} sub="Attached" onPress={() => void Linking.openURL(quote.url)} last />
        ) : (
          <FileRow title={upload.isPending ? 'Uploading…' : 'Attach a quote'} sub="A photo of your written quote" icon="paperclip" onPress={() => void attach()} last />
        )}
      </PtPanel>
      <PtDateSheet
        visible={picking !== null}
        title={picking === 'start' ? 'Starts' : 'Ends'}
        value={(picking === 'start' ? start : end) ?? ymdMonthsFromNow(1)}
        minYear={year}
        maxYear={year + 5}
        doneLabel="Done"
        onDone={(ymd) => {
          if (picking === 'start') setStart(ymd);
          else setEnd(ymd);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </PtPageScreen>
  );
}

/** INV-V4 "Sent to the Okafor family": the proposal and who it waits for. */
export function ChangesSentScreen({ navigation, route }: RootScreenProps<'ChangesSent'>) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const query = useProject(projectId);
  const d = query.data;
  const list = d?.milestones.filter((m) => m.status !== 'proposed' && m.status !== 'cancelled') ?? [];
  const changed = list.filter((m) => m.change_request?.by === 'vendor');
  const total = list.reduce((s, m) => s + Number(m.change_request?.by === 'vendor' && m.change_request.amount ? m.change_request.amount : m.amount), 0);
  const family = d?.project.family ?? 'family';

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <DoneHero />
          <PtText variant="headline" style={{ textAlign: 'center' }}>Sent to the {family}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
            {`They'll review your ${changed.map((m) => m.title).join(' and ') || ''} change${changed.length === 1 ? '' : 's'}. Once they agree, the project starts${list[0] ? ` and ${list[0].title} money is set aside for you` : ''}.`}
          </PtText>
        </View>
        {d ? (
          <PtPanel>
            <PtReviewRow
              label="Your proposal"
              value={`${formatNaira(total)} total`}
              sub={changed.map((m) => (m.change_request?.amount ? `${m.title} ${formatNaira(m.amount)} → ${formatNaira(m.change_request.amount)}` : `${m.title}: new dates`)).join(' · ') || null}
            />
            <PtReviewRow label="Waiting for" value={namesList(d.project.approvers.map((a) => a.first_name)) || 'The family'} sub="You'll get a notification" last />
          </PtPanel>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        <PtButton title="Go to my projects" onPress={() => navigation.navigate('VendorTabs', { screen: 'VendorHome' })} />
        <PtButton title="Check my public profile" variant="ghost" onPress={() => navigation.navigate('VendorTabs', { screen: 'VendorProfileTab' })} />
      </View>
    </View>
  );
}
