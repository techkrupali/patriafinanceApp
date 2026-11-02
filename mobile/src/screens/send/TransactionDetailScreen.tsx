import React, { useState } from 'react';
import { ActivityIndicator, Linking, Share, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtNote, PtPanel, PtReviewRow, PtChoiceCard } from '../../components/pt/PtForm';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useReceiptLink, useReportTransaction, useTransaction } from '../../api/payments';
import { initialsOf } from '../../store/sendDraft';
import { formatMoney, formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** "23 Oct 2026, 4:18 pm" */
function stamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}, ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/**
 * TXN-02 Transaction: who, how much, where from, the note, whether it needed
 * an approval, the fee and reference; TXN-03 the receipt to share or download;
 * TXN-04 report a problem ("I didn't make this payment" freezes the account).
 */
export function TransactionDetailScreen({ navigation, route }: RootScreenProps<'TransactionDetail'>) {
  const id = route.params.id;
  const q = useTransaction(id);
  const receipt = useReceiptLink(id);
  const report = useReportTransaction(id);
  const [reporting, setReporting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const t = q.data;
  const credit = t?.direction === 'credit';
  const who = t?.counterparty_name ?? t?.title.replace(/^(To|From) /, '') ?? '';
  const status = t?.status === 'successful' ? 'Completed' : t?.status === 'failed' ? 'Failed' : t?.status === 'pending' ? 'Processing' : t?.status;
  const receiptText = t ? `Patriai receipt\n${formatMoney(t.amount)} ${credit ? 'from' : 'to'} ${who}\n${t.wallet?.name ?? ''}\n${stamp(t.created_at)}\nReference ${t.reference}` : '';

  return (
    <PtPageScreen title="Transaction" subtitle={t ? stamp(t.created_at) : null} onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !t ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <PtAvatar initials={initialsOf(who || '?')} size={56} tone="mint" />
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 32, color: credit ? pt.brand : pt.ink }}>{`${credit ? '+' : '−'} ${formatMoney(t.amount)}`}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{`${credit ? 'From' : 'To'} ${who}`}</Text>
            <PtChip label={status ?? ''} tone={t.status === 'successful' ? 'success' : t.status === 'failed' ? 'danger' : 'warning'} icon={t.status === 'successful' ? 'check' : t.status === 'failed' ? 'x' : 'clock'} />
          </View>
          <PtPanel>
            <PtReviewRow label={credit ? 'Into' : 'From'} value={[t.wallet?.name, t.category].filter(Boolean).join(' · ')} />
            {/* Only a note someone wrote, not the automatic "Withdrawal to …". */}
            {t.description && !/^(Withdrawal to|Transfer to|Transfer from) /.test(t.description) ? <PtReviewRow label="Note" value={t.description} /> : null}
            {!credit ? <PtReviewRow label="Approval" value={t.approval?.by.length ? `Approved by ${t.approval.by.join(', ')}` : 'Not needed'} /> : null}
            {t.by && !t.by_me ? <PtReviewRow label="By" value={t.by} /> : null}
            <PtReviewRow label="Fee" value={formatNaira(t.fee)} />
            <PtReviewRow label="Reference" value={t.reference} last />
          </PtPanel>
          <PtPanel>
            <PtReviewRow label="Receipt" value="Share or download" last />
            <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 12 }}>
              <PtButton title="Share" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void Share.share({ message: receiptText })} />
              <PtButton
                title="Download PDF"
                size="sm"
                variant="secondary"
                style={{ flex: 1 }}
                loading={receipt.isPending}
                onPress={() => receipt.mutate(undefined, { onSuccess: (d) => void Linking.openURL(d.url), onError: (e) => showAlert('Not ready', e.message) })}
              />
            </View>
          </PtPanel>
          {t.reported ? (
            t.dispute_id ? (
              <PtButton title="See the dispute" variant="secondary" onPress={() => navigation.navigate('DisputeDetail', { disputeId: t.dispute_id! })} />
            ) : (
              <PtNote tone="info">You reported a problem with this. Our team is looking into it; we'll reply in Help → Chat with us.</PtNote>
            )
          ) : (
            <PtButton title="Report a problem" variant="ghost" onPress={() => setReporting(true)} />
          )}
        </>
      )}

      <PtSheet
        visible={reporting}
        title="Report a problem"
        subtitle={t ? `${formatNaira(t.amount)} ${credit ? 'from' : 'to'} ${who}` : undefined}
        onClose={() => setReporting(false)}
        footer={
          <PtButton
            title="Continue"
            disabled={!problem}
            loading={report.isPending}
            onPress={() =>
              problem &&
              report.mutate(
                { problem, details: details.trim() || undefined },
                {
                  onSuccess: (r) => {
                    notifySuccess();
                    setReporting(false);
                    if (r.frozen) showAlert('We froze your account', 'Nothing can leave your wallets now. Our fraud team will be in touch too.');
                    // DSP-05: the dispute it opened, which Patriai decides within 5 working days.
                    navigation.navigate('DisputeDetail', { disputeId: r.dispute_id });
                  },
                  onError: (e) => showAlert('Not sent', e.message),
                },
              )
            }
          />
        }
      >
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>What's wrong?</Text>
          {(t?.problems ?? []).map((p) => (
            <PtChoiceCard
              key={p.key}
              title={p.label}
              subtitle={p.key === 'not_me' ? "We'll freeze the wallet right away" : p.key === 'goods' ? 'Opens a dispute that Patriai looks into' : undefined}
              selected={problem === p.key}
              onPress={() => {
                selection();
                setProblem(p.key);
              }}
            />
          ))}
          <PtField label="Anything else? (optional)" value={details} onChangeText={setDetails} maxLength={1000} />
        </View>
      </PtSheet>
    </PtPageScreen>
  );
}
