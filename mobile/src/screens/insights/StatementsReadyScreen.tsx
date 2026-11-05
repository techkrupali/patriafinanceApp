import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCard } from '../../components/pt/PtList';
import { PtNote, PtSegmented } from '../../components/pt/PtForm';
import { useEmailStatements, useStatementBatch, useStatementBatchLink, type BatchFormat } from '../../api/insights';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';
import { Loaded, openDownload } from './parts';

const FORMAT: Record<BatchFormat, { label: string; bg: string; fg: string }> = {
  pdf: { label: 'PDF', bg: pt.dangerSoft, fg: pt.danger },
  xlsx: { label: 'Excel', bg: pt.brandSoft, fg: pt.brand },
  csv: { label: 'CSV', bg: pt.infoSoft, fg: pt.info },
};

/**
 * STM-02 Statements ready: each file with its dates and how many items, as
 * PDF, Excel or CSV; download one, all of them (a zip, or the combined file),
 * or have them emailed.
 */
export function StatementsReadyScreen({ navigation, route }: RootScreenProps<'StatementsReady'>) {
  const { walletIds, period, from, to, combined } = route.params;
  const options = { wallet_ids: walletIds, period, from: from ?? null, to: to ?? null, combined };
  const q = useStatementBatch(options);
  const link = useStatementBatchLink();
  const email = useEmailStatements();
  const [format, setFormat] = useState<BatchFormat>('pdf');
  const [busy, setBusy] = useState<string | null>(null);
  const d = q.data;
  const files = d?.files ?? [];
  const empty = files.every((f) => f.count === 0);

  const download = (key: string, walletId: number | null) => {
    setBusy(key);
    link.mutate(
      { ...options, format, wallet_id: walletId },
      {
        onSuccess: ({ url }) => {
          notifySuccess();
          openDownload(url);
        },
        onError: (e) => showAlert('Could not download', e.message),
        onSettled: () => setBusy(null),
      },
    );
  };

  const send = () =>
    email.mutate(
      { ...options, format },
      {
        onSuccess: (r) => {
          notifySuccess();
          showAlert('Statements sent', `We emailed them to ${r.sent_to}.`);
        },
        onError: (e) => showAlert('Could not send', e.message),
      },
    );

  const one = files.length === 1;
  const f = FORMAT[format];

  return (
    <PtPageScreen
      title="Statements ready"
      subtitle={d ? `${files.length} file${one ? '' : 's'} · ${f.label}` : null}
      onBack={() => navigation.goBack()}
      footer={
        d ? (
          <>
            <PtButton
              title={one ? `Download ${f.label}` : 'Download all (zip)'}
              onPress={() => download('all', one && !combined ? walletIds[0] : null)}
              loading={busy === 'all'}
              disabled={empty || busy !== null}
            />
            {d.email ? (
              <Pressable
                onPress={() => {
                  selection();
                  send();
                }}
                disabled={email.isPending || empty}
                accessibilityRole="button"
                style={{ alignSelf: 'center', paddingVertical: 6, opacity: email.isPending || empty ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{email.isPending ? 'Sending…' : `Email to ${d.email}`}</Text>
              </Pressable>
            ) : null}
          </>
        ) : undefined
      }
    >
      <Loaded query={q}>
        {() => (
          <>
            <PtCard>
              {files.map((file, i) => (
                <View
                  key={file.key}
                  style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === files.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: ptRadius.sm, backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={format === 'pdf' ? 'file-text' : 'grid'} size={19} color={f.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{`${file.label} · ${file.count} item${file.count === 1 ? '' : 's'}`}</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      selection();
                      download(file.key, combined ? null : file.wallet_ids[0]);
                    }}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Download ${file.name}`}
                    hitSlop={8}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {busy === file.key ? <ActivityIndicator color={pt.brand} /> : <Feather name="download" size={22} color={pt.brand} />}
                  </Pressable>
                </View>
              ))}
            </PtCard>
            <PtSegmented
              options={[
                { value: 'pdf', label: 'PDF' },
                { value: 'xlsx', label: 'Excel' },
                { value: 'csv', label: 'CSV' },
              ]}
              value={format}
              onChange={setFormat}
            />
            {empty ? (
              <PtNote tone="attention">No money moved in these wallets in this period, so there is nothing to download.</PtNote>
            ) : (
              <PtNote tone="info">Each file shows the account number, the opening and closing balance and every payment. Download links work for 10 minutes.</PtNote>
            )}
          </>
        )}
      </Loaded>
    </PtPageScreen>
  );
}
