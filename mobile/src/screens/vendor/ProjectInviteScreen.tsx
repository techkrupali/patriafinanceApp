import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { useMyVendorProfile, useProject } from '../../api/hooks';
import { useDeclineProject } from '../../api/projectFlow';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtNote, PtPanel, PtPills, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { LoadingBlock, TextArea } from '../../components/project/ProjectUi';
import { formatNaira, initials } from '../../lib/format';
import { DECLINE_REASONS, milestoneDates, monthName, namesList } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Project, VendorDeclined } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "to build their house", "to renovate their home", "for their event". */
function invitedTo(p: Project): string {
  switch (p.setup?.kind) {
    case 'building':
      return 'to build their house';
    case 'renovation':
      return 'to renovate their home';
    case 'event':
      return 'for their event';
    default:
      return `for ${p.title}`;
  }
}

/** The next six months as YYYY-MM, for "Suggest I can start in March". */
function nextMonths(): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()] };
  });
}

/** INV-V1 "The Okafor family invited Adeyemi Builders Ltd to build their house" — review the milestones, or decline (INV-V5). */
export function ProjectInviteScreen({ navigation, route }: RootScreenProps<'ProjectInvite'>) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const query = useProject(projectId);
  const mine = useMyVendorProfile();
  const decline = useDeclineProject();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState<VendorDeclined['reason']>('fully_booked');
  const [message, setMessage] = useState('');
  const [suggest, setSuggest] = useState(false);
  const months = nextMonths();
  const [month, setMonth] = useState(months[2].value);
  const d = query.data;
  const p = d?.project;
  const business = mine.data?.profile;

  if (!d || !p) {
    return (
      <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 4, paddingHorizontal: 12 }}>
        <PtBackButton onPress={() => navigation.goBack()} />
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const family = p.family ? `The ${p.family}` : 'A family';
  const plan = d.milestones.filter((m) => m.status !== 'proposed' && m.status !== 'cancelled');
  const release = p.setup?.release;
  const proof = [release?.photos !== false ? 'Photos' : null, release?.video ? 'a video' : null, release?.receipts ? 'receipts' : null].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const first = plan[0];
  const last = plan[plan.length - 1];
  const when = first || last ? milestoneDates({ starts_on: first?.starts_on ?? p.setup?.starts_on ?? null, due_date: last?.due_date ?? p.setup?.finishes_on ?? null }, 'months') : '';
  const waiting = p.vendor_status === 'changes_proposed';

  const sendDecline = () =>
    decline.mutate(
      { projectId, reason, message: message.trim() || undefined, start_month: suggest ? month : undefined },
      {
        onSuccess: () => {
          setDeclineOpen(false);
          showAlert('Declined', `We've let the ${p.family ?? 'family'} know so they can find someone else.`);
          navigation.navigate('VendorTabs', { screen: 'VendorHome' });
        },
        onError: (e) => showAlert('Could not decline', (e as Error).message),
      },
    );

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12 }}>
        <PtBackButton onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        <PtLogo height={26} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PtAvatar initials={initials(p.owner?.name ?? 'F')} tone="brand" size={48} />
          <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.ink }}>
            <Text style={{ fontFamily: ptFont.bold }}>{family}</Text> invited <Text style={{ fontFamily: ptFont.bold }}>{p.vendor?.name ?? business?.business_name ?? 'you'}</Text> {invitedTo(p)}.
          </Text>
        </View>
        <PtChip label={waiting ? 'Your changes are with the family' : 'You: Vendor'} tone={waiting ? 'warning' : 'success'} icon={waiting ? 'clock' : 'check'} />
        <PtPanel>
          <PtReviewRow label="Project" value={p.title} sub={[p.setup?.location, when].filter(Boolean).join(' · ') || null} />
          <PtReviewRow label="Contract value" value={formatNaira(p.plan_total)} sub={`${plan.length} milestone${plan.length === 1 ? '' : 's'}`} />
          <PtReviewRow label="How you get paid" value="After each milestone is approved" sub={proof ? `${proof} for each` : null} last={!release?.retention_percent} />
          {release?.retention_percent ? (
            <PtReviewRow label="Held back" value={`${release.retention_percent}% until ${release.retention_months} month${release.retention_months === 1 ? '' : 's'} after handover`} last />
          ) : null}
        </PtPanel>
        {waiting ? (
          <PtNote>{`You asked for changes. ${namesList(p.approvers.map((a) => a.first_name)) || 'The family'} will review them; once they agree, the project starts.`}</PtNote>
        ) : !business || business.status === 'draft' ? (
          <Pressable onPress={() => { selection(); navigation.navigate('BusinessSetup', {}); }} accessibilityRole="button">
            <PtNote>New to Patriai? Set up a business account first. It takes about 10 minutes. Tap here to start.</PtNote>
          </Pressable>
        ) : !business.verified ? (
          <PtNote>You can accept now. Families can pay you once Patriai has verified your business.</PtNote>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        <PtButton title={waiting ? 'Go to my projects' : 'Review milestones'} onPress={() => (waiting ? navigation.navigate('VendorTabs', { screen: 'VendorHome' }) : navigation.navigate('InviteMilestones', { projectId }))} />
        <Pressable onPress={() => { selection(); setDeclineOpen(true); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Decline this project</Text>
        </Pressable>
      </View>

      <PtSheet
        visible={declineOpen}
        title="Decline this project?"
        subtitle={`We'll let the ${p.family ?? 'family'} know so they can find someone else.`}
        onClose={() => setDeclineOpen(false)}
        footer={
          <>
            <PtButton title="Decline invite" onPress={sendDecline} loading={decline.isPending} style={{ backgroundColor: pt.danger }} />
            <PtButton title="Go back" variant="ghost" onPress={() => setDeclineOpen(false)} />
          </>
        }
      >
        <PtPills options={DECLINE_REASONS} value={reason} onChange={setReason} />
        <TextArea label="Message to the family (optional)" value={message} onChange={setMessage} placeholder="We're booked until March. Happy to quote then." maxLength={500} minHeight={80} />
        <PtSwitchRow title={`Suggest I can start in ${monthName(month)}`} subtitle="They can re-invite you then" value={suggest} onChange={setSuggest} />
        {suggest ? <PtPills options={months} value={month} onChange={setMonth} /> : null}
      </PtSheet>
    </View>
  );
}
