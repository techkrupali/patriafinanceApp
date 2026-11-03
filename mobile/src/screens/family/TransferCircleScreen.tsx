import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtChoiceCard, PtGroupLabel, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useRequestTransfer, useTransferInfo } from '../../api/circles';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * FAM-12 "Hand the circle to someone else": the new owner (verified Tier 3)
 * accepts within 7 days, it takes effect 24 hours later and you can cancel
 * until then. You become a co-owner; your wallets and money stay yours.
 */
export function TransferCircleScreen({ navigation, route }: RootScreenProps<'TransferCircle'>) {
  const { circleId } = route.params;
  const q = useTransferInfo(circleId);
  const send = useRequestTransfer(circleId);
  const [to, setTo] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = q.data;

  if (!d) {
    return (
      <PtPageScreen title="Transfer ownership" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const chosen = d.candidates.find((c) => c.id === (to ?? d.candidates.find((x) => x.eligible)?.id));
  const first = chosen?.name.split(' ')[0] ?? 'They';

  return (
    <PtPageScreen
      title="Transfer ownership"
      subtitle={d.circle.name}
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton
            title="Continue with PIN"
            disabled={!chosen}
            onPress={() => {
              setError(null);
              if (!chosen?.eligible) return setError(`${first} needs to be verified to Tier 3 to own a circle.`);
              setPinError(null);
              setPinOpen(true);
            }}
          />
        </>
      }
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 30, lineHeight: 36, color: pt.ink }} accessibilityRole="header">Hand the circle to someone else</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted }}>The owner can change anything, including who else is an owner.</Text>
      </View>
      <PtGroupLabel>New owner</PtGroupLabel>
      {d.candidates.length ? (
        <View style={{ gap: 10 }}>
          {d.candidates.map((c) => (
            <PtChoiceCard key={c.id} title={c.name} subtitle={c.line} selected={chosen?.id === c.id} onPress={() => setTo(c.id)} />
          ))}
        </View>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>Invite someone into the circle first.</Text>
      )}
      <PtPanel>
        <PtReviewRow label="You become" value="Co-owner" sub="Your wallets and money stay yours" />
        <PtReviewRow label={`${first} must`} value={`Accept within ${d.accept_days} days`} />
        <PtReviewRow label="Takes effect" value={`${d.effect_hours} hours after ${first} accepts`} sub="You can cancel during that time" last />
      </PtPanel>

      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`Hand ${d.circle.name} to ${chosen?.name ?? ''}`}
        loading={send.isPending}
        error={pinError}
        onSubmit={(pin) =>
          chosen &&
          send.mutate(
            { to_user_id: chosen.id, pin },
            {
              onSuccess: () => {
                notifySuccess();
                setPinOpen(false);
                showAlert('Asked', `${first} has ${d.accept_days} days to accept. It takes effect ${d.effect_hours} hours after that.`);
                navigation.goBack();
              },
              onError: (e) => {
                if (/pin/i.test(e.message)) setPinError(e.message);
                else {
                  setPinOpen(false);
                  setError(e.message);
                }
              },
            },
          )
        }
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
