import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtNote, PtPanel } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useWallets } from '../../api/hooks';
import { useFundingOptions } from '../../api/funding';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ADD-01 Add money, choose a way: bank transfer (free, instant), a debit card
 * through the payment partner (ADD-03, coming soon until it's set up), USSD
 * (ADD-05), cash at an agent (ADD-06) or another wallet. Family abroad pay with
 * a contribution link.
 */
export function AddMoneyScreen({ navigation, route }: RootScreenProps<'AddMoney'>) {
  const wallets = useWallets();
  const list = wallets.data ?? [];
  const wallet = list.find((w) => w.id === route.params?.walletId) ?? list.find((w) => w.type === 'main');
  const options = useFundingOptions(wallet?.id ?? null);
  const card = options.data?.card;

  return (
    <PtPageScreen title="Add money" subtitle={wallet ? `To ${wallet.name}` : null} onBack={() => navigation.goBack()}>
      <PtPanel>
        <SettingsRow
          icon={<MaterialCommunityIcons name="bank-transfer-in" size={19} color={pt.brand} />}
          title="Bank transfer"
          sub="From any Nigerian bank · free · instant"
          onPress={wallet ? () => navigation.navigate('BankTransfer', { walletId: wallet.id }) : undefined}
        />
        <SettingsRow
          icon="credit-card"
          title="Debit card"
          sub={card?.enabled ? `Naira or foreign cards · ${card.fee_percent}% fee` : 'Naira or foreign cards · coming soon'}
          onPress={wallet && card?.enabled ? () => navigation.navigate('CardPay', { walletId: wallet.id }) : undefined}
        />
        <SettingsRow icon="hash" title="USSD" sub="No internet needed" onPress={wallet ? () => navigation.navigate('Ussd', { walletId: wallet.id }) : undefined} />
        <SettingsRow icon="map-pin" title="Cash at an agent" sub="Pay cash at a nearby Patriai agent" onPress={wallet ? () => navigation.navigate('Agents', { walletId: wallet.id }) : undefined} />
        <SettingsRow icon="repeat" title="From another wallet" sub="Move between your Patriai wallets" onPress={() => navigation.navigate('MoveMoney', wallet ? { toWalletId: wallet.type === 'main' ? undefined : wallet.id } : undefined)} last />
      </PtPanel>
      <View>
        <PtNote tone="info" icon="globe">Family abroad? Send them your contribution link. They pay by card in their own currency.</PtNote>
      </View>
    </PtPageScreen>
  );
}
