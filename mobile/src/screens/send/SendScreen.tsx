import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPanel, PtGroupLabel } from '../../components/pt/PtForm';
import { AVATAR_CYCLE, PtAvatar } from '../../components/pt/PtAvatar';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useSendOptions } from '../../api/payments';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/**
 * SND-01 Send money, "Who are you paying?": a saved account or Patriai user,
 * a bank account, one of my wallets, saved accounts, a QR code — and the people
 * paid lately, one tap from the amount.
 */
export function SendScreen({ navigation, route }: RootScreenProps<'Send'>) {
  const options = useSendOptions();
  const start = useSendDraft((s) => s.start);
  const setRecipient = useSendDraft((s) => s.setRecipient);
  const fromWalletId = route.params?.fromWalletId ?? null;

  useEffect(() => {
    start(fromWalletId);
  }, [start, fromWalletId]);

  const o = options.data;

  return (
    <PtPageScreen title="Send money" subtitle="Who are you paying?" onBack={() => navigation.goBack()}>
      <PtPanel>
        <SettingsRow icon="users" title="A saved account or Patriai user" sub="Family, friends, institutions, partners" onPress={() => navigation.navigate('SendRecipient')} />
        <SettingsRow icon={<MaterialCommunityIcons name="bank-outline" size={18} color={pt.brand} />} title="A bank account" sub={`Any Nigerian bank · ${o ? formatNaira(o.bank_fee) : '₦20'} fee`} onPress={() => navigation.navigate('SendBank')} />
        <SettingsRow icon="credit-card" title="One of my wallets" sub="Free" onPress={() => navigation.navigate('MoveMoney', fromWalletId ? { fromWalletId } : undefined)} />
        <SettingsRow
          icon="star"
          title="Manage saved accounts"
          sub={o ? `${o.saved_count} saved${o.group_count ? ` · ${o.group_count} group${o.group_count === 1 ? '' : 's'}` : ''}` : ' '}
          onPress={() => navigation.navigate('SavedAccounts')}
        />
        <SettingsRow icon="grid" title="Scan a QR code" sub="At a shop or a friend's phone" onPress={() => navigation.navigate('ScanQr')} last />
      </PtPanel>

      {o?.recent.length ? (
        <View style={{ gap: 12 }}>
          <PtGroupLabel>Recent</PtGroupLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {o.recent.slice(0, 4).map((r, i) => (
              <Pressable
                key={r.key}
                accessibilityRole="button"
                accessibilityLabel={`Pay ${r.name}`}
                onPress={() => {
                  selection();
                  setRecipient(
                    r.kind === 'user'
                      ? { kind: 'user', name: r.name, identifier: r.identifier ?? '', sub: r.username ? `Patriai · @${r.username}` : 'Patriai' }
                      : { kind: 'bank', name: r.name, bankCode: r.bank_code ?? '', bankName: r.bank_name ?? '', accountNumber: r.account_number ?? '', sub: `${r.bank_name ?? 'Bank'} •••• ${(r.account_number ?? '').slice(-4)}`, saved: true },
                  );
                  navigation.navigate('SendAmount');
                }}
                style={{ width: 72, alignItems: 'center', gap: 6 }}
              >
                <PtAvatar initials={initialsOf(r.name)} size={52} tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
                <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.ink, textAlign: 'center' }} numberOfLines={2}>
                  {r.name.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </PtPageScreen>
  );
}
