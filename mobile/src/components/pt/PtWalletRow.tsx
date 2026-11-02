import React from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { formatNaira } from '../../lib/format';
import { walletSubtitle } from '../../lib/walletRows';
import { walletVisual } from '../../lib/walletVisual';
import { PtIconTile, PtRow } from './PtList';
import type { Wallet } from '../../api/types';
import { walletColour } from '../../lib/walletColours';

/** A wallet in a Treasury list: type icon tile, name, one-line status, balance. */
export function PtWalletRow({
  wallet,
  onPress,
  last,
  hideAmount = false,
  long = false,
  onLongPress,
}: {
  wallet: Wallet;
  onPress: () => void;
  last?: boolean;
  hideAmount?: boolean;
  /** TRS-02's fuller line ("803 412 7790 · everyday"). */
  long?: boolean;
  onLongPress?: () => void;
}) {
  return (
    <PtRow
      title={wallet.name}
      subtitle={walletSubtitle(wallet, long)}
      minHeight={62}
      last={last}
      onPress={onPress}
      onLongPress={onLongPress}
      left={
        <PtIconTile>
          <Ionicons name={walletVisual(wallet.type).icon} size={19} color={walletColour(wallet.colour) ?? pt.brand} />
        </PtIconTile>
      }
      right={
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink, fontVariant: ['tabular-nums'] }}>
          {/* WPV-05: a relative on a child's wallet isn't shown the balance. */}
          {/* TRS-02: an ajo pot isn't yours — show what you've paid in. */}
          {hideAmount ? '₦ ••••' : wallet.type === 'ajo' ? `${formatNaira(wallet.ajo?.paid ?? '0')} paid` : (wallet.balance as string | null) === null ? 'Gifts only' : formatNaira(wallet.balance)}
        </Text>
      }
    />
  );
}
