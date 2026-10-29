import React, { useState } from 'react';
import { ActivityIndicator, Platform, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { useFundingDetails, useWallet } from '../../api/hooks';
import { notifySuccess, selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * WAL-05 Account details: the wallet's own account number for anyone to pay
 * into, Copy and Share, the contribution link for family abroad, and that
 * paying out still follows the approval rules.
 */
export function WalletAccountScreen({ navigation, route }: RootScreenProps<'WalletAccount'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const funding = useFundingDetails(walletId);
  const wallet = detail.data?.wallet;
  const [copied, setCopied] = useState(false);
  const account = funding.data?.account_number ?? wallet?.virtual_account ?? null;
  const bank = funding.data?.bank_name ?? wallet?.virtual_account_bank ?? null;
  const name = funding.data?.account_name ?? null;
  const link = wallet?.goal?.link ?? null;

  const copy = async () => {
    if (!account) return;
    selection();
    await Clipboard.setStringAsync(account);
    notifySuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = () => {
    if (!account) return;
    selection();
    void Share.share({
      message: `Pay into ${wallet?.name ?? 'our wallet'} on Patriai\nAccount number: ${account}${bank ? `\nBank: ${bank}` : ''}${name ? `\nName: ${name}` : ''}${link ? `\nFrom abroad: ${link}` : ''}`,
    });
  };

  return (
    <PtPageScreen title="Account details" subtitle={wallet?.name} onBack={() => navigation.goBack()}>
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 14 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.onDarkMuted }}>Anyone can pay into this wallet directly</Text>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.onDarkMuted }}>Account number</Text>
          {account ? (
            <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 30, letterSpacing: 1, color: '#FFFFFF' }} selectable accessibilityLabel={`Account number ${account.split('').join(' ')}`}>
              {account.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3')}
            </Text>
          ) : funding.isLoading ? (
            <ActivityIndicator color="#FFFFFF" style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.onDarkMuted }}>
              {funding.error ? (funding.error as Error).message : 'The account number is being set up.'}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.onDarkMuted }}>Bank</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: '#FFFFFF' }}>{bank ?? '—'}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.onDarkMuted }}>Account name</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: '#FFFFFF' }}>{name ?? '—'}</Text>
          </View>
        </View>
      </View>

      {account ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PtButton title={copied ? 'Copied' : 'Copy'} variant="mint" icon={<Feather name="copy" size={17} color={pt.brand} />} style={{ flex: 1 }} onPress={() => void copy()} />
          <PtButton title="Share" icon={<Feather name="share" size={17} color={pt.onBrand} />} style={{ flex: 1 }} onPress={share} />
        </View>
      ) : null}

      <PtPanel>
        {link ? (
          <PtReviewRow
            label="Paying from abroad"
            value="Use the contribution link"
            sub={`Family abroad open ${link.replace(/^https?:\/\//, '')} to see the account and pay`}
            onEdit={() => {
              void Share.share({ message: `Help us reach ${wallet?.name ?? 'our goal'} on Patriai: ${link}` });
            }}
          />
        ) : null}
        <PtReviewRow label="Money paid in lands" value="Instantly, with the sender's name" last />
      </PtPanel>

      <PtNote tone="info" icon="lock">
        This account only accepts money. Paying out still follows the wallet's approval rules.
      </PtNote>
      {wallet?.status === 'frozen' ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Feather name="pause" size={14} color={pt.inkMuted} />
          <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>The wallet is paused, and money can still come in.</Text>
        </View>
      ) : null}
    </PtPageScreen>
  );
}
