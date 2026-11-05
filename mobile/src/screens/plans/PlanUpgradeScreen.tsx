import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadError } from '../../components/LoadError';
import { usePlans, useStartSubscription } from '../../api/plans';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/**
 * PLN-02 Upgrade to Pro: the price for the whole family, the free trial and
 * when the first payment is, that it can be cancelled any time before, and the
 * wallet it's paid from. Then the PIN.
 */
export function PlanUpgradeScreen({ navigation, route }: RootScreenProps<'PlanUpgrade'>) {
  const { plan: slug, interval } = route.params;
  const q = usePlans();
  const start = useStartSubscription();
  const [walletId, setWalletId] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const d = q.data;

  if (q.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  const plan = d?.plans.find((p) => p.slug === slug);
  if (!d || !plan) return <LoadError message={(q.error as Error | null)?.message ?? 'This plan isn’t available right now.'} onRetry={() => void q.refetch()} />;

  const yearly = interval === 'yearly';
  const price = yearly ? plan.yearly_price : plan.monthly_price;
  const trial = d.trial_available && plan.trial_days > 0;
  const firstPayment = new Date(Date.now() + plan.trial_days * 86400000);
  const family = d.family.name ? `the ${d.family.name}` : 'your family';
  const wallet = d.wallets.find((w) => w.id === walletId) ?? d.wallets[0];
  const short = !trial && wallet ? parseFloat(wallet.balance) < parseFloat(price) : false;

  const pay = (pin: string) => {
    if (!wallet) return;
    setPinError(null);
    start.mutate(
      { plan: plan.slug, interval, wallet_id: wallet.id, pin },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          navigation.replace('Subscription');
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title={`Upgrade to ${plan.name}`}
      subtitle={`${yearly ? 'Yearly' : 'Monthly'} · whole ${d.family.name ?? 'family'}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={trial ? 'Start free trial' : `Pay ${formatNaira(price)}`} onPress={() => setPinOpen(true)} disabled={!wallet || short} />}
    >
      <PtPanel>
        <PtReviewRow label={`${plan.name}, ${yearly ? 'yearly' : 'monthly'}`} value={formatNaira(price)} sub={`Covers everyone in ${family}`} />
        {trial ? <PtReviewRow label="Free trial" value={`${plan.trial_days} days`} sub={`First payment on ${dayLabel(firstPayment)}`} /> : null}
        <PtReviewRow label="Cancel" value={trial ? 'Any time before then, no charge' : 'Any time, no more payments after'} last />
      </PtPanel>

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Pay with</PtGroupLabel>
        {d.wallets.length ? (
          d.wallets.map((w) => (
            <PtChoiceCard key={w.id} title={w.name} subtitle={`${formatNaira(w.balance)} available`} selected={wallet?.id === w.id} onPress={() => setWalletId(w.id)} />
          ))
        ) : (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Open a Main wallet to pay from.</Text>
        )}
      </View>

      {short ? <PtNote tone="attention">{`Not enough in ${wallet?.name}. Add money first, or choose another wallet.`}</PtNote> : null}
      <PtNote tone="info" icon="bell">
        {trial ? 'We’ll remind you 3 days before the trial ends.' : `We’ll take ${formatNaira(price)} now, then every ${yearly ? 'year' : 'month'} until you cancel.`}
      </PtNote>

      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={trial ? `Start ${plan.name} free. ${formatNaira(price)} from ${wallet?.name} on ${dayLabel(firstPayment)} unless you cancel.` : `Pay ${formatNaira(price)} from ${wallet?.name} for ${plan.name}.`}
        amount={trial ? undefined : formatNaira(price)}
        loading={start.isPending}
        error={pinError}
        onSubmit={pay}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
