import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useDispute, useDisputeFile, useRespondToDispute } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtChoiceCard, PtGroupLabel } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { LoadingBlock, PhotoGrid, TextArea } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput, toYmd } from '../../lib/format';
import { deadlineDay } from '../../lib/projects';
import { pickFile } from '../../lib/upload';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

type Answer = 'fix' | 'partial_refund' | 'disagree';

/** DSP-07 the builder's answer: offer to fix it by a date, offer a partial refund, or disagree with photos. */
export function DisputeRespondScreen({ navigation, route }: RootScreenProps<'DisputeRespond'>) {
  const { disputeId } = route.params;
  const query = useDispute(disputeId);
  const respond = useRespondToDispute(disputeId);
  const addFile = useDisputeFile(disputeId);
  const [type, setType] = useState<Answer>('fix');
  const [fixBy, setFixBy] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [body, setBody] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const d = query.data;

  if (!d) {
    return (
      <PtPageScreen title="Respond" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const onHold = Number(d.amount_on_hold ?? 0);
  const valid = type === 'fix' ? Boolean(fixBy) : type === 'partial_refund' ? Number(amount) > 0 && Number(amount) < onHold : body.trim().length > 0;
  const family = d.files.filter((f) => f.from === 'family');
  const mine = d.files.filter((f) => f.from === 'vendor');

  const send = () => {
    respond.mutate(
      { type, fix_by: type === 'fix' ? fixBy ?? undefined : undefined, amount: type === 'partial_refund' ? amount : undefined, body: body.trim() || undefined },
      {
        onSuccess: () => {
          showAlert('Response sent', `${d.raised_by?.first_name ?? 'The family'} has been told.`);
          navigation.navigate('VendorTabs', { screen: 'VendorDisputes' });
        },
        onError: (e) => showAlert('Not sent', (e as Error).message),
      },
    );
  };

  const addPhoto = async () => {
    const f = await pickFile('library', 'media');
    if (f) addFile.mutate(f, { onError: (e) => showAlert('Could not add it', (e as Error).message) });
  };

  const today = new Date();
  return (
    <PtPageScreen
      title={d.subject}
      subtitle={`Raised by ${d.raised_by?.first_name ?? 'the family'}${d.reply_by ? ` · reply by ${deadlineDay(d.reply_by)}` : ''}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Send response" onPress={send} disabled={!valid || !d.can.reply} loading={respond.isPending} />}
    >
      {family.length ? <PhotoGrid photos={family.map((f) => ({ key: f.id, url: f.url, video: f.kind === 'video', document: f.kind === 'document' }))} /> : null}
      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>"{d.description}"</Text>
        {d.amount_on_hold ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted, marginTop: 6 }}>
            {d.milestone?.title} · {formatNaira(d.amount_on_hold)} on hold · they asked for: {d.remedy_label?.toLowerCase()}
          </Text>
        ) : null}
      </View>
      <PtGroupLabel>Your response</PtGroupLabel>
      <PtChoiceCard title="Offer to fix it" subtitle="Pick a date. The payment is released when the family approves the fix." selected={type === 'fix'} onPress={() => setType('fix')} />
      <PtChoiceCard title="Offer a partial refund" subtitle="Suggest an amount. The rest is paid to you." selected={type === 'partial_refund'} onPress={() => setType('partial_refund')} />
      <PtChoiceCard title="I disagree" subtitle="Add your own photos and explain." selected={type === 'disagree'} onPress={() => setType('disagree')} />

      {type === 'fix' ? <PtField label="Fixed by" value={fixBy ? formatYmd(fixBy) : ''} placeholder="Pick a date" onPressBox={() => setDateOpen(true)} /> : null}
      {type === 'partial_refund' ? (
        <PtField
          label="Refund to the family"
          prefix="₦"
          value={groupAmountInput(amount)}
          onChangeText={(t) => setAmount(sanitizeAmountInput(t).split('.')[0])}
          keyboardType="number-pad"
          placeholder="0"
          hint={onHold ? `Less than ${formatNaira(onHold)}. You'd be paid ${formatNaira(Math.max(0, onHold - Number(amount || 0)))} before anything held back.` : undefined}
        />
      ) : null}
      <TextArea label={type === 'disagree' ? 'Why you disagree' : 'Message to the family (optional)'} value={body} onChange={setBody} placeholder={type === 'fix' ? "We'll inspect on Monday and re-lay the kitchen." : type === 'disagree' ? 'The floor was level when we finished; see the photos from handover.' : ''} maxLength={2000} />
      {type === 'disagree' ? (
        <PhotoGrid photos={mine.map((f) => ({ key: f.id, url: f.url, video: f.kind === 'video', document: f.kind === 'document' }))} onAdd={d.can.add_evidence ? () => void addPhoto() : undefined} adding={addFile.isPending} />
      ) : null}

      <PtDateSheet
        visible={dateOpen}
        title="Fixed by"
        value={fixBy ?? toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3))}
        minYear={today.getFullYear()}
        maxYear={today.getFullYear() + 1}
        doneLabel="Done"
        onDone={(ymd) => {
          setDateOpen(false);
          if (ymd < toYmd(today)) showAlert('Pick a later date', 'The fix date can’t be in the past.');
          else setFixBy(ymd);
        }}
        onClose={() => setDateOpen(false)}
      />
    </PtPageScreen>
  );
}
