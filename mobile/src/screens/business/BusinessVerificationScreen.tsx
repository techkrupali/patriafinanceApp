import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { useMyVendorProfile } from '../../api/hooks';
import { useSubmitBusiness, useVendorHome } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip, type PtChipTone } from '../../components/pt/PtChip';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtText } from '../../components/pt/PtText';
import { PtRow } from '../../components/pt/PtList';
import { DoneHero, LoadingBlock } from '../../components/project/ProjectUi';
import { Feather } from '@expo/vector-icons';
import type { MyVendorProfile, VerificationItemStatus } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

const STEP_OF: Record<string, number> = { owner: 2, id_document: 3, cac: 4, directors: 5, address: 6, bank: 7 };

const CHIPS: Record<VerificationItemStatus, { label: string; tone: PtChipTone; icon: 'check' | 'clock' | 'x' | 'circle' }> = {
  approved: { label: 'Approved', tone: 'success', icon: 'check' },
  pending: { label: 'Checking', tone: 'info', icon: 'clock' },
  waiting: { label: 'Waiting', tone: 'warning', icon: 'clock' },
  redo: { label: 'Redo', tone: 'danger', icon: 'x' },
  todo: { label: 'To do', tone: 'neutral', icon: 'circle' },
};

/** VON-09 Verification (and VDM-02), or VON-10 once the business is verified. */
export function BusinessVerificationScreen({ navigation }: RootScreenProps<'BusinessVerification'>) {
  const query = useMyVendorProfile();
  const profile = query.data?.profile;

  if (!profile) {
    return (
      <PtPageScreen title="Verification" onBack={() => navigation.goBack()}>
        {query.isLoading || query.error ? (
          <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
        ) : (
          <View style={{ gap: 14 }}>
            <PtText color={pt.inkMuted}>You haven't set up a business account yet.</PtText>
            <PtButton title="Set up a business account" onPress={() => navigation.replace('BusinessSetup', {})} />
          </View>
        )}
      </PtPageScreen>
    );
  }
  if (profile.status === 'verified') return <Verified profile={profile} navigation={navigation} />;
  return <UnderReview profile={profile} navigation={navigation} />;
}

type Nav = RootScreenProps<'BusinessVerification'>['navigation'];

function UnderReview({ profile, navigation }: { profile: MyVendorProfile; navigation: Nav }) {
  const submit = useSubmitBusiness();
  const v = profile.verification;
  const redo = v.items.find((i) => i.status === 'redo');
  const todo = v.items.find((i) => i.status === 'todo');
  const draft = profile.status === 'draft';
  const approvedAll = v.items.every((i) => i.status === 'approved');

  const headline = draft
    ? v.ready ? 'Ready to send' : `${v.items.filter((i) => i.status === 'todo').length} things still to add`
    : v.needs_you > 0 ? `${v.needs_you} thing${v.needs_you === 1 ? '' : 's'} need${v.needs_you === 1 ? 's' : ''} you` : "We're checking your business";
  const sub = draft
    ? 'Send everything once, and Patriai checks it. Usually done in 1 working day.'
    : v.needs_you > 0 ? 'The rest is with Patriai. Usually done in 1 working day.' : 'Usually done in 1 working day.';

  const primary = redo
    ? { title: redo.item === 'address' ? 'Upload a new proof of address' : `Fix ${redo.label.toLowerCase()}`, go: () => navigation.navigate('BusinessSetup', { step: STEP_OF[redo.item] }) }
    : draft && v.ready
      ? {
          title: 'Submit for review',
          go: () => submit.mutate(undefined, { onError: (e) => showAlert('Not ready yet', (e as Error).message) }),
        }
      : draft && todo
        ? { title: 'Continue setup', go: () => navigation.navigate('BusinessSetup', { step: STEP_OF[todo.item] }) }
        : { title: 'Go to my business home', go: () => goHome(navigation) };

  return (
    <PtPageScreen
      title="Verification"
      subtitle={profile.business_name}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={primary.title} onPress={primary.go} loading={submit.isPending} disabled={approvedAll && !draft} />}
    >
      <View style={{ backgroundColor: v.needs_you > 0 || draft ? '#FDEBC8' : pt.infoSoft, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', gap: 12 }}>
        <Feather name="clock" size={22} color={v.needs_you > 0 || draft ? '#8F5400' : pt.info} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{headline}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{sub}</Text>
        </View>
      </View>
      <PtPanel>
        {v.items.map((it, i) => {
          const chip = CHIPS[it.status];
          return (
            <PtRow
              key={it.item}
              title={it.label}
              subtitle={it.note ?? it.sub}
              subtitleColor={it.status === 'redo' ? pt.danger : pt.inkMuted}
              right={<PtChip label={chip.label} tone={chip.tone} icon={chip.icon} />}
              onPress={it.status === 'approved' ? undefined : () => navigation.navigate('BusinessSetup', { step: STEP_OF[it.item] })}
              last={i === v.items.length - 1}
            />
          );
        })}
      </PtPanel>
      <PtNote icon="lock">Until you're approved you can accept invites and chat, but families can't pay you yet. Your details stay private; families see your name, badge and reviews.</PtNote>
    </PtPageScreen>
  );
}

function goHome(navigation: Nav) {
  void useAuth.getState().setMode('business');
  navigation.reset({ index: 0, routes: [{ name: 'VendorTabs' }] });
}

/** VON-10 "Adeyemi Builders is verified". */
function Verified({ profile, navigation }: { profile: MyVendorProfile; navigation: Nav }) {
  const insets = useSafeAreaInsets();
  const home = useVendorHome();
  const invites = home.data?.needs.filter((n) => n.kind === 'invite') ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <DoneHero initials={profile.initials} />
          <PtText variant="headline" style={{ textAlign: 'center' }}>{profile.business_name} is verified</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>Families can now pay you through milestones, and you appear in the vendor directory.</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="Badge" value="Verified business" />
          {profile.bank ? <PtReviewRow label="Payouts to" value={`${profile.bank.account_name ?? profile.business_name} · •••• ${profile.bank.last4}`} /> : null}
          <PtReviewRow
            label="Waiting for you"
            value={invites.length ? `${invites.length} project invite${invites.length === 1 ? '' : 's'}` : 'No invites yet'}
            sub={invites[0]?.sub}
            onEdit={invites[0] ? () => navigation.navigate('ProjectInvite', { projectId: invites[0].project_id }) : undefined}
            last
          />
        </PtPanel>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        <PtButton title="Go to my business home" onPress={() => goHome(navigation)} />
        <PtButton title="See my public profile" variant="ghost" onPress={() => navigation.navigate('VendorProfile', { profileId: profile.id })} />
      </View>
    </View>
  );
}
