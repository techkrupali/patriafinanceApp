import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useBudget } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { Tile } from '../savings/CoSaverView';
import { formatNaira } from '../../lib/format';
import { dayTime } from '../../lib/projects';
import type { Wallet, WalletDetailData } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

/**
 * WPV-08 Spending, seen by a spender: "Hi Bisi · You can spend today ₦12,500
 * of ₦15,000 · Food and market only", their last payment, and Pay · Snap
 * receipt · Ask for more. The household balance, sending anywhere and the
 * other categories stay with the owners.
 */
export function SpenderView({ wallet, detail }: { wallet: Wallet; detail: WalletDetailData }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const q = useBudget(wallet.id);
  const b = q.data;
  const owners = detail.members.filter((m) => ['owner', 'co_owner'].includes(m.role)).map((m) => m.name.split(' ')[0]);
  const ownerNames = owners.length > 1 ? `${owners.slice(0, -1).join(', ')} and ${owners[owners.length - 1]}` : owners[0] ?? 'The owner';
  const canSpend = Boolean(detail.my_can_spend);

  if (!b) return <ActivityIndicator color={pt.brand} style={{ marginTop: 40 }} />;

  const names = b.me.category_names ?? null;
  // What's left for me: today's allowance, else what's left in my categories, else the wallet.
  const mineLeft = names ? b.categories.filter((c) => names.includes(c.name)).reduce((t, c) => t + Math.max(0, Number(c.limit) - Number(c.spent)), 0) : null;
  const left = b.me.left_today != null ? Number(b.me.left_today) : mineLeft ?? Number(wallet.balance);
  const of = b.me.daily_limit ? `of ${formatNaira(b.me.daily_limit)}` : null;
  const which = names ? `${names.join(', ')} only` : 'Any category';
  const last = b.me.last;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>{`${(wallet.owner?.name ?? '').split(' ').slice(-1)[0] || ownerNames} household`}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, letterSpacing: -0.5, color: pt.ink }}>{`Hi ${me?.first_name ?? ''}`}</Text>
      </View>

      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 6 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{b.me.daily_limit ? 'You can spend today' : 'You can spend'}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(Math.min(left, Number(wallet.balance)))}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{[of, which].filter(Boolean).join(' · ')}</Text>
      </View>

      {last ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="shopping-bag" size={18} color={pt.inkMuted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{last.title}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{[dayTime(last.created_at), last.category].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{`−${formatNaira(last.amount)}`}</Text>
        </View>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Your payments from here show up for you and {ownerNames}.</Text>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="send" label="Pay" disabled={!canSpend || left <= 0} why={!canSpend ? `${ownerNames} hasn't let you spend yet.` : 'Nothing left to spend today.'} onPress={() => navigation.navigate('Send', { fromWalletId: wallet.id })} />
          <Tile icon="camera" label="Snap receipt" disabled why="Receipts on payments are coming soon. Your payments are already recorded." />
          <Tile icon="message-circle" label="Ask for more" onPress={() => navigation.navigate('RequestSpend', { walletId: wallet.id })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="lock" label="Household balance" disabled why={`Only ${ownerNames} see the whole balance.`} />
          <Tile icon="lock" label="Send money" disabled why="You pay for what the household needs, from your categories." />
          <Tile icon="lock" label="Other categories" disabled why={names ? `You can spend on ${names.join(', ')}.` : 'You can already spend on every category.'} />
        </View>
      </View>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{`${ownerNames} ${owners.length > 1 ? 'see' : 'sees'} each payment.`}</Text>
    </View>
  );
}
