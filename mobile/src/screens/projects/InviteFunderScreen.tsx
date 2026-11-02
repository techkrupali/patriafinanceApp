import React, { useState } from 'react';
import { View } from 'react-native';
import { useProject } from '../../api/hooks';
import { useInviteFunder } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtChoiceCard, PtGroupLabel, PtNote } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { DEFAULT_COUNTRY, toE164 } from '../../lib/phone';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * CTB-01 Invite to the project: a phone number and what they can do — put
 * money in, approve milestones (counting towards "2 of 3"), join the chat,
 * see documents and proof, request payments.
 */
export function InviteFunderScreen({ navigation, route }: RootScreenProps<'InviteFunder'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const invite = useInviteFunder(query.data?.project.wallet_id ?? 0);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [can, setCan] = useState({ fund: true, approve: true, chat: true, view: true, request: false });
  const [error, setError] = useState<string | null>(null);

  if (!query.data) {
    return (
      <PtPageScreen title="Invite to the project" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const p = query.data.project;
  const rules = query.data.approval_rules;
  const n = (rules?.approvers.length ?? 1) + 1;
  const needed = rules ? (rules.mode === 'all' || rules.mode === 'named' ? n : rules.needed) : 1;
  const flip = (k: keyof typeof can) => setCan((c) => ({ ...c, [k]: !c[k] }));
  const items: { k: keyof typeof can; title: string; sub: string }[] = [
    { k: 'fund', title: 'Put money in', sub: 'Funds go to the project wallet' },
    { k: 'approve', title: 'Approve milestones', sub: rules?.mode === 'any' ? 'Any one approver releases a payment' : `Counts towards ${needed} of ${n}` },
    { k: 'chat', title: 'Join the project chat', sub: 'With the family and the builder' },
    { k: 'view', title: 'See documents and proof', sub: 'Contract, photos, receipts' },
    { k: 'request', title: 'Request payments', sub: 'Ask to pay a vendor' },
  ];

  const send = () => {
    setError(null);
    if (phone.length < 7) return setError('Enter their phone number.');
    invite.mutate(
      {
        identifier: toE164(country.dial, phone),
        role: can.fund || can.approve || can.request ? 'contributor' : 'viewer',
        can_approve: can.approve,
        permissions: { fund: can.fund, view: can.view, request: can.request, chat: can.chat },
      },
      {
        onSuccess: () => {
          notifySuccess();
          showAlert('Invite sent', can.approve ? "They'll be asked to verify to Tier 2 before their yes can release money." : 'We sent them a link to join.');
          navigation.goBack();
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  };

  return (
    <PtPageScreen title="Invite to the project" subtitle={p.title} onBack={() => navigation.goBack()} footer={<PtButton title="Send invite" loading={invite.isPending} onPress={send} />}>
      <PtPhoneField label="Phone number" country={country} onChangeCountry={setCountry} value={phone} onChange={setPhone} />
      <View style={{ gap: 10 }}>
        <PtGroupLabel>What can they do</PtGroupLabel>
        {items.map((x) => (
          <PtChoiceCard key={x.k} kind="check" title={x.title} subtitle={x.sub} selected={can[x.k]} onPress={() => flip(x.k)} />
        ))}
      </View>
      {can.approve ? <PtNote tone="attention" icon="shield">Approvers must verify to Tier 2, since their yes releases money.</PtNote> : null}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtPageScreen>
  );
}
