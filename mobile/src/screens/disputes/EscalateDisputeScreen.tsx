import React, { useState } from 'react';
import { View } from 'react-native';
import { pt } from '../../theme';
import { useDispute, useEscalateDispute } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { TextArea } from '../../components/project/ProjectUi';
import { dayMonth, deadlineDay } from '../../lib/projects';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/** DSP-08 "Ask Patriai to step in": a case officer decides within 5 working days; evidence for 2 more days. */
export function EscalateDisputeScreen({ navigation, route }: RootScreenProps<'EscalateDispute'>) {
  const { disputeId } = route.params;
  const query = useDispute(disputeId);
  const escalate = useEscalateDispute(disputeId);
  const [note, setNote] = useState('');
  const d = query.data;
  const evidenceUntil = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const vendor = d?.viewer === 'vendor';

  const send = () => {
    escalate.mutate(note.trim(), {
      onSuccess: (r) => {
        showAlert('Sent to Patriai', `A case officer will decide by ${deadlineDay(r.decision_due)}.`);
        navigation.goBack();
      },
      onError: (e) => showAlert('Not sent', (e as Error).message),
    });
  };

  return (
    <PtPageScreen
      title="Ask Patriai to step in"
      subtitle={d?.number ? `Dispute #${d.number}` : undefined}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Send to Patriai" onPress={send} loading={escalate.isPending} disabled={!d?.can.escalate} />}
    >
      <View style={{ gap: 6 }}>
        <PtText variant="headline">We'll look at both sides</PtText>
        <PtText color={pt.inkMuted}>A Patriai case officer reviews the photos, messages and contract, then decides.</PtText>
      </View>
      <PtPanel>
        <PtReviewRow label="Decision within" value="5 working days" />
        <PtReviewRow label="Money stays" value={vendor ? 'On hold in the family’s project wallet' : 'On hold in your project wallet'} />
        <PtReviewRow label="Both sides can" value={`Add evidence until ${dayMonth(evidenceUntil)}`} last />
      </PtPanel>
      <TextArea label="Anything else we should know?" value={note} onChange={setNote} placeholder="The builder agreed to fix it but hasn't come." maxLength={1000} />
      <PtNote>Once Patriai decides, the decision is final for this dispute. You can still go to court if you choose.</PtNote>
    </PtPageScreen>
  );
}
