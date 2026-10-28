import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtButton } from '../pt/PtButton';
import { PtSheet } from '../pt/PtSheet';
import { PinSheet } from '../PinSheet';
import { useCancelGoal } from '../../api/hooks';

/** GLW-05 "If the goal is cancelled — everyone gets back what they put in", with the owner's PIN. */
export function GoalCancelButton({ walletId, name }: { walletId: number; name: string }) {
  const cancel = useCancelGoal(walletId);
  const [step, setStep] = useState<null | 'confirm' | 'pin'>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <PtButton title="Cancel the goal" variant="ghost" onPress={() => setStep('confirm')} />
      <PtSheet
        visible={step === 'confirm'}
        title={`Cancel ${name}?`}
        onClose={() => setStep(null)}
        footer={
          <View style={{ gap: 10 }}>
            <PtButton title="Cancel the goal" onPress={() => setStep('pin')} />
            <PtButton title="Keep it" variant="ghost" onPress={() => setStep(null)} />
          </View>
        }
      >
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>
          Everyone gets back what they put in, gifts included. Anything left comes to your Main wallet. This can't be undone.
        </Text>
      </PtSheet>
      <PinSheet
        visible={step === 'pin'}
        title="Enter your PIN"
        subtitle={`To cancel ${name} and give everyone their money back`}
        loading={cancel.isPending}
        error={error}
        onSubmit={(pin) => {
          setError(null);
          cancel.mutate({ pin }, { onSuccess: () => setStep(null), onError: (e) => setError(e.message) });
        }}
        onClose={() => setStep(null)}
      />
    </>
  );
}
