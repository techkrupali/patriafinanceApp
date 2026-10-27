import React from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { formatNaira } from '../../lib/format';
import { walletSubtitle } from '../../lib/walletRows';
import { walletVisual } from '../../lib/walletVisual';
import { PtIconTile, PtRow } from './PtList';
import type { Wallet } from '../../api/types';

/** A wallet in a Treasury list: type icon tile, name, one-line status, balance. */
export function PtWalletRow({
  wallet,
  onPress,
  last,
  hideAmount = false,
}: {
  wallet: Wallet;
  onPress: () => void;
  last?: boolean;
  hideAmount?: boolean;
}) {
  return (
    <PtRow
      title={wallet.name}
      subtitle={walletSubtitle(wallet)}
      minHeight={62}
      last={last}
      onPress={onPress}
      left={
        <PtIconTile>
          <Ionicons name={walletVisual(wallet.type).icon} size={19} color={pt.brand} />
        </PtIconTile>
      }
      right={
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink, fontVariant: ['tabular-nums'] }}>
          {hideAmount ? '₦ ••••' : formatNaira(wallet.balance)}
        </Text>
      }
    />
  );
}
