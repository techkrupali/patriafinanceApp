import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtNote, PtPanel } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useWallets } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ADD-01 Add money, choose a way: bank transfer (free, instant), from another
 * wallet, and the ways that need a payment partner — card, USSD, cash at an
 * agent — shown as coming. Family abroad pay with a contribution link.
 */
export function AddMoneyScreen({ navigation, route }: RootScreenProps<'AddMoney'>) {
  const wallets = useWallets();
  const list = wallets.data ?? [];
  const wallet = list.find((w) => w.id === route.params?.walletId) ?? list.find((w) => w.type === 'main');

  return (
    <PtPageScreen title="Add money" subtitle={wallet ? `To ${wallet.name}` : null} onBack={() => navigation.goBack()}>
      <PtPanel>
        <SettingsRow
          icon={<MaterialCommunityIcons name="bank-transfer-in" size={19} color={pt.brand} />}
          title="Bank transfer"
          sub="From any Nigerian bank · free · instant"
          onPress={wallet ? () => navigation.navigate('BankTransfer', { walletId: wallet.id }) : undefined}
        />
        <SettingsRow icon="credit-card" title="Debit card" sub="Naira or foreign cards · coming soon" />
        <SettingsRow icon="hash" title="USSD" sub="No internet needed · coming soon" />
        <SettingsRow icon="map-pin" title="Cash at an agent" sub="Pay cash at a nearby Patriai agent · coming soon" />
        <SettingsRow icon="repeat" title="From another wallet" sub="Move between your Patriai wallets" onPress={() => navigation.navigate('MoveMoney', wallet ? { toWalletId: wallet.type === 'main' ? undefined : wallet.id } : undefined)} last />
      </PtPanel>
      <View>
        <PtNote tone="info" icon="globe">Family abroad? Send them your contribution link. They pay by card in their own currency.</PtNote>
      </View>
    </PtPageScreen>
  );
}
