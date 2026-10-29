import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { useWallet } from '../../api/hooks';
import { useEmailStatement, useStatementLink, useStatementSummary, type StatementPeriod } from '../../api/walletManage';
import { formatNaira, formatYmd, toYmd } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * WAL-15 Statement: this month, the last 3 months, since the start or picked
 * dates; PDF or a spreadsheet; each person's contributions and the audit log
 * if wanted. Download, or email it to yourself.
 */
export function WalletStatementScreen({ navigation, route }: RootScreenProps<'WalletStatement'>) {
  const { walletId, audit: withAudit } = route.params;
  const detail = useWallet(walletId);
  const today = toYmd(new Date());
  const [period, setPeriod] = useState<StatementPeriod>('since_start');
  const [from, setFrom] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)));
  const [to, setTo] = useState<string>(today);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [contributions, setContributions] = useState(true);
  const [audit, setAudit] = useState(Boolean(withAudit));

  const options = { period, from: period === 'custom' ? from : null, to: period === 'custom' ? to : null };
  const summary = useStatementSummary(walletId, options);
  const link = useStatementLink(walletId);
  const email = useEmailStatement(walletId);
  const s = summary.data;
  const shared = (detail.data?.members.length ?? 0) > 1;
  const body = { ...options, format, contributions: shared && contributions, audit: Boolean(s?.can_include_audit) && audit };

  const download = () =>
    link.mutate(body, {
      onSuccess: ({ url }) => {
        notifySuccess();
        if (Platform.OS === 'web') window.open(url, '_blank');
        else void Linking.openURL(url);
      },
      onError: (e) => showAlert('Could not download', e.message),
    });

  const send = () =>
    email.mutate(body, {
      onSuccess: (r) => {
        notifySuccess();
        showAlert('Statement sent', `We emailed it to ${r.sent_to}.`);
      },
      onError: (e) => showAlert('Could not send', e.message),
    });

  return (
    <PtPageScreen
      title="Statement"
      subtitle={detail.data?.wallet.name}
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton title={format === 'pdf' ? 'Download PDF' : 'Download spreadsheet'} onPress={download} loading={link.isPending} disabled={!s || s.count === 0} />
          {s?.email ? (
            <Pressable
              onPress={() => {
                selection();
                send();
              }}
              disabled={email.isPending || s.count === 0}
              accessibilityRole="button"
              style={{ alignSelf: 'center', paddingVertical: 6, opacity: email.isPending || s.count === 0 ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{email.isPending ? 'Sending…' : `Email to ${s.email}`}</Text>
            </Pressable>
          ) : null}
        </>
      }
    >
      <View style={{ gap: 12 }}>
        <PtGroupLabel>Period</PtGroupLabel>
        <PtPills
          options={[
            { value: 'this_month', label: 'This month' },
            { value: 'last_3_months', label: 'Last 3 months' },
            { value: 'since_start', label: 'Since start' },
            { value: 'custom', label: 'Pick dates' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        {period === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <PtField label="From" value={formatYmd(from)} editable={false} onPressBox={() => setPicking('from')} />
            </View>
            <View style={{ flex: 1 }}>
              <PtField label="To" value={formatYmd(to)} editable={false} onPressBox={() => setPicking('to')} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        <PtGroupLabel>Format</PtGroupLabel>
        <PtSegmented
          options={[
            { value: 'pdf', label: 'PDF' },
            { value: 'csv', label: 'Spreadsheet (CSV)' },
          ]}
          value={format}
          onChange={setFormat}
        />
      </View>

      <PtPanel>
        {shared ? (
          <PtSwitchRow title="Show each person's contributions" subtitle="Useful when sharing with family" value={contributions} onChange={setContributions} />
        ) : null}
        {s?.can_include_audit ? <PtSwitchRow title="Include the audit log" value={audit} onChange={setAudit} /> : null}
      </PtPanel>

      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 4 }}>
        {summary.isLoading ? (
          <ActivityIndicator color={pt.brand} />
        ) : s ? (
          <>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
              {formatYmd(s.from)} to {formatYmd(s.to)}
            </Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>
              {s.count} transaction{s.count === 1 ? '' : 's'} · {formatNaira(s.in)} in
              {parseFloat(s.out) > 0 ? ` · ${formatNaira(s.out)} out` : ''}
            </Text>
          </>
        ) : (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.danger }}>{(summary.error as Error | null)?.message ?? 'Could not load the period.'}</Text>
        )}
      </View>
      {s && s.count === 0 ? <PtNote tone="info">No money moved in this period, so there is nothing to download.</PtNote> : null}

      <PtDateSheet
        visible={picking !== null}
        title={picking === 'from' ? 'From' : 'To'}
        value={picking === 'from' ? from : to}
        minYear={2024}
        maxYear={new Date().getFullYear()}
        doneLabel="Done"
        onDone={(ymd) => {
          if (picking === 'from') setFrom(ymd > to ? to : ymd);
          else setTo(ymd > today ? today : ymd < from ? from : ymd);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </PtPageScreen>
  );
}
