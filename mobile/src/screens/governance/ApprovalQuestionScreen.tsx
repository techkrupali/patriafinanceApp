import React, { useState } from 'react';
import { Text } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useApproval, useApprovalQuestion } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const QUICK = ['Can I see the receipt or letter?', 'Is that the full amount?', 'Can it be less?'];

/**
 * APR-05 Ask a question: a quick question or your own, and "Pause the request
 * until Tolu answers · It won't expire while you wait".
 */
export function ApprovalQuestionScreen({ navigation, route }: RootScreenProps<'ApprovalQuestion'>) {
  const { approvalId } = route.params;
  const q = useApproval(approvalId);
  const qa = useApprovalQuestion(approvalId);
  const [body, setBody] = useState('');
  const [pause, setPause] = useState(true);
  const a = q.data;

  if (!a) {
    return (
      <PtPageScreen title="Ask a question" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  const first = (a.initiator?.name ?? 'them').split(' ')[0];

  return (
    <PtPageScreen
      title="Ask a question"
      subtitle={`${first}'s request${a.governance ? '' : ` · ${formatNaira(a.amount)}`}`}
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Send question"
          disabled={!body.trim()}
          loading={qa.ask.isPending}
          onPress={() =>
            qa.ask.mutate(
              { body: body.trim(), pause },
              {
                onSuccess: () => {
                  notifySuccess();
                  showAlert('Sent', `${first} will see your question${pause ? '. The request waits for the answer.' : '.'}`);
                  navigation.navigate('Approvals');
                },
                onError: (e) => showAlert('Not sent', (e as Error).message),
              },
            )
          }
        />
      }
    >
      {a.description ? <Text style={{ fontFamily: ptFont.medium, fontSize: 15, lineHeight: 22, color: pt.ink }}>{`"${a.description}"`}</Text> : null}
      <PtGroupLabel>Quick questions</PtGroupLabel>
      <PtPills options={QUICK.map((x) => ({ value: x, label: x }))} value={QUICK.includes(body) ? body : null} onChange={setBody} />
      <PtField label="Your message" value={body} onChangeText={setBody} maxLength={300} placeholder={`Ask ${first} anything`} />
      <PtPanel>
        <PtSwitchRow title={`Pause the request until ${first} answers`} subtitle="It won't expire while you wait" value={pause} onChange={setPause} />
      </PtPanel>
    </PtPageScreen>
  );
}
