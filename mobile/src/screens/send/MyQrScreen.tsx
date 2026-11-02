import React, { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtSegmented } from '../../components/pt/PtForm';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtQrCode } from '../../components/pt/PtQrCode';
import { useAuth } from '../../store/auth';
import { initialsOf } from '../../store/sendDraft';
import { API_URL } from '../../config';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** The pay link a QR holds: anyone's camera opens it; Patriai opens "How much?" for you. */
export function payLink(tag: string, amount?: string): string {
  const base = API_URL.replace(/\/api\/v1\/?$/, '');
  return `${base}/p/${encodeURIComponent(tag)}${amount ? `?amount=${encodeURIComponent(amount)}` : ''}`;
}

/**
 * QR-01 My QR code, "Show this to get paid": your name and @tag over a code
 * that pays into Main — any amount, or an amount you set — to share or show.
 */
export function MyQrScreen({ navigation }: RootScreenProps<'MyQr'>) {
  const me = useAuth((s) => s.user);
  const [mode, setMode] = useState<'any' | 'set'>('any');
  const [amount, setAmount] = useState('');
  const tag = me?.username ?? me?.phone ?? '';
  const link = payLink(tag, mode === 'set' && parseFloat(amount) > 0 ? amount : undefined);

  return (
    <PtPageScreen
      title="My QR code"
      subtitle="Show this to get paid"
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton
            title="Share my code"
            onPress={() => void Share.share({ message: `Pay ${me?.full_name ?? 'me'} on Patriai${mode === 'set' && parseFloat(amount) > 0 ? ` (${formatNaira(amount)})` : ''}: ${link}` })}
          />
          <PtButton title="Scan to pay" variant="ghost" onPress={() => navigation.navigate('ScanQr')} />
        </View>
      }
    >
      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.lg, padding: 24, alignItems: 'center', gap: 10 }}>
        <PtAvatar initials={initialsOf(me?.full_name ?? '')} size={56} uri={me?.avatar_url} />
        <Text style={{ fontFamily: ptFont.bold, fontSize: 19, color: pt.ink }}>{me?.full_name}</Text>
        {me?.username ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>@{me.username}</Text> : null}
        <View accessibilityLabel={`QR code to pay ${me?.full_name ?? 'you'}`} style={{ paddingVertical: 8 }}>
          <PtQrCode value={link} size={220} />
        </View>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>
          {mode === 'set' && parseFloat(amount) > 0 ? `${formatNaira(amount)} into Main wallet` : 'Pays into Main wallet'}
        </Text>
      </View>
      <PtSegmented options={[{ value: 'any', label: 'Any amount' }, { value: 'set', label: 'Set an amount' }]} value={mode} onChange={setMode} />
      {mode === 'set' ? <PtHeroAmount value={amount} onChange={setAmount} label="Amount to ask for" /> : null}
    </PtPageScreen>
  );
}
