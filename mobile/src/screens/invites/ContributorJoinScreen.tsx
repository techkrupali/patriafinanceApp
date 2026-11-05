import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtChip } from '../../components/pt/PtChip';
import { PtChoiceCard, PtNote, PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtText } from '../../components/pt/PtText';
import { LoadError } from '../../components/LoadError';
import { useAcceptInvitation, useMyInvitations, useUpdateProfile, useWallets, type AcceptInvitationOptions } from '../../api/hooks';
import { useLimits } from '../../api/account';
import { useAuth } from '../../store/auth';
import { formatNaira, formatYmd, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type How = 'bank' | 'card' | 'wallet';

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/**
 * Joining a goal as a contributor. INV-C1 "A few details": contributors only
 * need basic checks — name and date of birth, a BVN if they want higher limits.
 * INV-C2 "How will you add money?": a bank transfer to the wallet's own
 * account, a card (not yet), or from a Patriai wallet; and "Contribute every
 * month". Then INV-C3 "You've joined".
 */
export function ContributorJoinScreen({ navigation, route }: RootScreenProps<'ContributorJoin'>) {
  const { invitationId } = route.params;
  const user = useAuth((s) => s.user);
  const invitations = useMyInvitations();
  const inv = invitations.data?.find((i) => i.id === invitationId) ?? null;
  const wallets = useWallets();
  const limits = useLimits();
  const accept = useAcceptInvitation();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState<1 | 2>(1);
  const [first, setFirst] = useState(user?.first_name ?? '');
  const [last, setLast] = useState(user?.last_name ?? '');
  const [how, setHow] = useState<How>('bank');
  const [monthly, setMonthly] = useState(false);
  const [amount, setAmount] = useState('');
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = inv?.savings ?? null;
  const pledge = plan ? null : inv?.pledge ?? null;
  // The plan's own amount applies unless the owner lets contributors choose.
  const ownAmount = !plan || (plan.allow_contributor_edit && plan.schedule !== false);
  useEffect(() => {
    if (plan?.amount) setAmount(String(parseFloat(plan.amount)));
    else if (pledge?.amount) setAmount(String(parseFloat(pledge.amount)));
  }, [plan?.amount, pledge?.amount]);

  const tier = user?.kyc_tier ?? 0;
  const bvnLimit = limits.data?.tiers.find((t) => t.tier === 1)?.daily ?? null;
  const nameLocked = tier >= 1;
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && w.type !== 'child');
  const source = sources.find((w) => w.id === sourceId) ?? sources.find((w) => w.type === 'main') ?? sources[0];
  const day = Math.min(28, new Date().getDate());
  const walletName = inv?.wallet?.name ?? 'the wallet';

  const next = () => {
    setError(null);
    if (!first.trim() || !last.trim()) return setError('Add your first and last name.');
    if (!nameLocked && (first.trim() !== user?.first_name || last.trim() !== user?.last_name)) {
      updateProfile.mutate({ first_name: first.trim(), last_name: last.trim() }, { onSuccess: () => setStep(2), onError: (e) => setError(e.message) });
      return;
    }
    setStep(2);
  };

  const join = () => {
    if (!inv) return;
    setError(null);
    let options: AcceptInvitationOptions = {};
    if (monthly && source) {
      options = plan
        ? { source_wallet_id: source.id, ...(ownAmount ? { amount, frequency: 'monthly', day_of_month: plan.day_of_month ?? day } : {}) }
        : { source_wallet_id: source.id, amount, frequency: 'monthly', day_of_month: day };
    }
    accept.mutate(
      { invitationId: inv.id, options },
      {
        onSuccess: (data) => {
          notifySuccess();
          navigation.replace('GoalJoined', { walletId: data.wallet.id, how: how === 'wallet' ? 'wallet' : 'bank' });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  if (invitations.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  if (!inv) {
    return (
      <PtPageScreen title="Joining as a contributor" onBack={() => navigation.goBack()}>
        <LoadError message="This invite is no longer waiting for you." onRetry={() => void invitations.refetch()} />
      </PtPageScreen>
    );
  }

  const needsAmount = monthly && ownAmount && !(parseFloat(amount) > 0);

  if (step === 1) {
    return (
      <PtPageScreen
        title="Joining as a contributor"
        subtitle={walletName}
        onBack={() => navigation.goBack()}
        footer={<PtButton title="Continue" onPress={next} loading={updateProfile.isPending} />}
      >
        <View style={{ gap: 6 }}>
          <PtText variant="headline">A few details</PtText>
          <PtText color={pt.inkMuted}>Contributors only need basic checks, so this is quick.</PtText>
        </View>
        <PtField label="First name" value={first} onChangeText={setFirst} editable={!nameLocked} autoCapitalize="words" textContentType="givenName" />
        <PtField label="Last name" value={last} onChangeText={setLast} editable={!nameLocked} autoCapitalize="words" textContentType="familyName" hint={nameLocked ? 'Matches your BVN' : undefined} />
        {user?.date_of_birth ? <PtField label="Date of birth" value={formatYmd(user.date_of_birth)} editable={false} /> : null}
        <PtCard>
          <PtRow
            title={tier >= 1 ? 'BVN added' : 'Add your BVN'}
            subtitle={tier >= 1 ? 'Your bank details are checked' : `Optional · lets you add up to ${bvnLimit ? formatNaira(bvnLimit) : 'more'} a day`}
            left={<PtIconTile><Feather name="shield" size={18} color={pt.brand} /></PtIconTile>}
            right={tier >= 1 ? <PtChip label="Done" tone="success" icon="check" /> : undefined}
            chevron={tier < 1}
            last
            onPress={tier < 1 ? () => navigation.navigate('KycSubmit', { targetTier: 1 }) : undefined}
          />
        </PtCard>
        {tier < 1 ? <PtNote tone="info">Living abroad? You can verify with a passport instead.</PtNote> : null}
        {error ? <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.danger }}>{error}</Text> : null}
      </PtPageScreen>
    );
  }

  return (
    <PtPageScreen
      title="How will you add money?"
      subtitle={walletName}
      onBack={() => setStep(1)}
      footer={<PtButton title={`Join ${walletName}`} onPress={join} loading={accept.isPending} disabled={needsAmount || (monthly && !source)} />}
    >
      <View style={{ gap: 10 }}>
        <PtChoiceCard icon="home" title="Bank transfer" subtitle="Send to the wallet's own account number from any bank." selected={how === 'bank'} onPress={() => setHow('bank')} />
        <View style={{ opacity: 0.55 }}>
          <PtChoiceCard icon="credit-card" title="Debit card" subtitle="Coming soon. Use a bank transfer for now." selected={false} onPress={() => setError('Paying by card is coming soon. Choose a bank transfer or your Patriai wallet for now.')} />
        </View>
        <PtChoiceCard icon="briefcase" title="From my Patriai wallet" subtitle="Instant and free." selected={how === 'wallet'} onPress={() => setHow('wallet')} />
      </View>

      <PtPanel>
        <PtSwitchRow
          title="Contribute every month"
          subtitle={plan && !ownAmount ? `${plan.label}, as the plan says` : 'Saved for you from a Patriai wallet, change any time'}
          value={monthly}
          onChange={setMonthly}
        />
      </PtPanel>

      {monthly ? (
        <View style={{ gap: 12 }}>
          {ownAmount ? (
            <PtField
              label="How much each month"
              prefix="₦"
              value={amount}
              onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
              keyboardType="decimal-pad"
              placeholder="25,000"
              hint={`On the ${ordinal(plan?.day_of_month ?? day)} of each month`}
            />
          ) : null}
          <PtCard>
            <PtRow
              title={`From ${source?.name ?? 'your wallet'}`}
              subtitle={source ? `${formatNaira(source.balance)} there now` : 'Open a wallet first'}
              chevron={sources.length > 1}
              last
              onPress={sources.length > 1 ? () => setPicking(true) : undefined}
            />
          </PtCard>
        </View>
      ) : null}

      {how === 'bank' && !monthly ? <PtNote tone="info">{"After you join you'll see the wallet's account number. Send to it from any bank, whenever you like."}</PtNote> : null}
      {error ? <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.danger }}>{error}</Text> : null}

      <PtOptionSheet
        visible={picking}
        title="Save from which wallet?"
        options={sources.map((w) => ({ value: w.id, label: w.name, hint: formatNaira(w.balance) }))}
        value={source?.id ?? null}
        onPick={(id) => {
          setSourceId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
