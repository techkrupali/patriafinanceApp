import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useConfirmScheduled, useScheduledPayment, useSendScheduledNow } from '../../api/scheduled';
import { useAuth } from '../../store/auth';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * RUL-08 "Mama Okafor upkeep was cancelled": what it was, when we warned you,
 * the next try, and "Send it now instead". Also RUL-04's "Confirm tomorrow's
 * payment" for the people asked first.
 */
export function PaymentOutcomeScreen({ navigation, route }: RootScreenProps<'PaymentOutcome'>) {
  const { paymentId, confirm } = route.params;
  const me = useAuth((s) => s.user);
  const q = useScheduledPayment(paymentId);
  const sendNow = useSendScheduledNow(paymentId);
  const yes = useConfirmScheduled(paymentId);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const p = q.data;

  if (!p) {
    return (
      <PtPageScreen title="Payment" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  const label = p.name || p.to_name;
  const amount = `₦${Math.round(Number(p.amount)).toLocaleString('en-NG')}`;
  const asking = confirm && (p.confirm?.user_ids ?? []).includes(me?.id ?? 0);
  const cancelled = p.last_result === 'cancelled' || p.last_result === 'skipped';

  return (
    <PtPageScreen
      title=""
      onBack={() => navigation.goBack()}
      footer={
        asking ? (
          <PtButton title={p.confirmed ? 'Confirmed' : 'Yes, send it'} disabled={p.confirmed} loading={yes.isPending} onPress={() => yes.mutate(undefined, { onSuccess: () => { notifySuccess(); showAlert('Confirmed', `${label} goes out on the day.`); navigation.goBack(); }, onError: (e) => showAlert('Not confirmed', e.message) })} />
        ) : (
          <>
            {cancelled ? <PtButton title="Send it now instead" onPress={() => { setPinError(null); setPinOpen(true); }} /> : null}
            <PtButton title="See the rule" variant="ghost" onPress={() => navigation.navigate('ScheduledPayments')} />
          </>
        )
      }
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 16 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#FDEBC8', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={asking ? 'help-circle' : 'alert-triangle'} size={36} color="#8F5400" />
        </View>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, lineHeight: 32, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">
          {asking ? `Confirm ${label}?` : cancelled ? `${label} was ${p.last_result === 'skipped' ? 'skipped' : 'cancelled'}` : label}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted, textAlign: 'center' }}>
          {asking ? 'It waits for a yes. If nobody confirms by noon on the day, it is skipped this time.' : p.last_reason ?? ''}
        </Text>
      </View>
      <PtPanel>
        <PtReviewRow label="Payment" value={`${amount} to ${p.to_name}`} sub={p.from.name ? `From ${p.from.name}` : null} />
        {p.warned_on?.length ? <PtReviewRow label="Warned you" value={p.warned_on.map(day).join(' and ')} /> : null}
        <PtReviewRow label={asking ? 'Goes out' : 'Next try'} value={p.next_run_at ? day(p.next_run_at) : 'No more dates'} last />
      </PtPanel>
      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`Send ${amount} to ${p.to_name} now`}
        loading={sendNow.isPending}
        error={pinError}
        onSubmit={(pin) => sendNow.mutate({ pin }, { onSuccess: () => { notifySuccess(); setPinOpen(false); showAlert('Sent', `${amount} went to ${p.to_name}.`); navigation.goBack(); }, onError: (e) => setPinError(e.message) })}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
