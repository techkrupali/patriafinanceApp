import React, { useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useFundingDetails, useWallets } from '../../api/hooks';
import { useLimits } from '../../api/account';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/** "803 412 7790" */
const spaced = (n: string) => n.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');

/**
 * ADD-02 Bank transfer: the wallet's own account number, bank and name to
 * copy or share, when it arrives, and what this tier lets the wallet hold.
 */
export function BankTransferScreen({ navigation, route }: RootScreenProps<'BankTransfer'>) {
  const { walletId } = route.params;
  const q = useFundingDetails(walletId);
  const wallets = useWallets();
  const limits = useLimits();
  const [copied, setCopied] = useState(false);
  const wallet = (wallets.data ?? []).find((w) => w.id === walletId);
  const d = q.data;
  const name = d?.account_name?.replace(/^PATRIAI\//, '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const details = d ? `Account number: ${d.account_number}\nBank: ${d.bank_name ?? ''}\nName: ${d.account_name}` : '';
  const l = limits.data;

  return (
    <PtPageScreen
      title="Bank transfer"
      subtitle={wallet?.name ?? null}
      onBack={() => navigation.goBack()}
      footer={
        d?.account_number ? (
          <View style={{ gap: 4 }}>
            <PtButton
              title={copied ? 'Copied' : 'Copy details'}
              onPress={() => {
                void Clipboard.setStringAsync(details);
                notifySuccess();
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            />
            <PtButton title="Share" variant="ghost" onPress={() => void Share.share({ message: `Pay me on Patriai\n${details}` })} />
          </View>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !d ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : !d.account_number ? (
        <PtNote tone="attention">This wallet's account number is still being set up. Check again in a few minutes.</PtNote>
      ) : (
        <>
          <PtPanel>
            <View style={{ paddingVertical: 12, gap: 2, borderBottomWidth: 1, borderBottomColor: pt.line }}>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Account number</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 28, letterSpacing: 1, color: pt.ink, fontVariant: ['tabular-nums'] }} accessibilityLabel={`Account number ${d.account_number}`}>
                {spaced(d.account_number)}
              </Text>
            </View>
            <PtReviewRow label="Bank" value={d.bank_name ?? '—'} />
            <PtReviewRow label="Name" value={name ?? d.account_name} last />
          </PtPanel>
          <PtPanel>
            <PtReviewRow label="Arrives" value="Usually within a minute" />
            {l ? (
              <PtReviewRow
                label="This account can hold"
                value={l.max_balance ? `Up to ${formatNaira(l.max_balance)} · Tier ${l.tier}` : `No limit · Tier ${l.tier}`}
                sub={l.max_balance ? 'Verify more to raise it' : null}
                onEdit={l.max_balance ? () => navigation.navigate('Kyc') : undefined}
                last
              />
            ) : null}
          </PtPanel>
          <PtNote tone="info">We'll notify you the moment it lands. Transfers from accounts not in your name may be checked first.</PtNote>
        </>
      )}
    </PtPageScreen>
  );
}
