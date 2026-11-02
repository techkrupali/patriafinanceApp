import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../../theme';
import { PtPageScreen } from '../../../components/pt/PtPageScreen';
import { PtButton } from '../../../components/pt/PtButton';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../../components/pt/PtForm';
import { LoadError } from '../../../components/LoadError';
import { ReleaseRequestCard, keyholderNames } from '../../../components/emergency/EmergencyUi';
import { useEmergency, useWallet } from '../../../api/hooks';
import { useAuth } from '../../../store/auth';
import { formatMoney, formatNaira } from '../../../lib/format';
import type { RootScreenProps } from '../../../navigation/types';

/**
 * WAL-16 Emergency policy: what's ready, the release rules (keyholders, how
 * many must say yes, fast release, trusted contacts), "Changing these rules
 * needs 2 of 3 keyholders", what's waiting, and Release money. The client's
 * own rules (custom PIN, death unlock, beneficiaries) open from "More ways".
 */
export function EmergencyPolicyScreen({ navigation, route }: RootScreenProps<'EmergencyPolicy'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const q = useEmergency(walletId);
  const detail = useWallet(walletId);
  const e = q.data;
  const wallet = detail.data?.wallet;
  const owner = wallet?.owner?.name ?? detail.data?.members.find((m) => m.role === 'owner')?.name;
  const edit = e?.me.can_edit_rules ? () => navigation.navigate('EditEmergencyRules', { walletId }) : undefined;

  if (!e || !wallet) {
    return (
      <PtPageScreen title={wallet?.name ?? 'Emergency fund'} onBack={() => navigation.goBack()}>
        {q.error ? <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : <ActivityIndicator color={pt.brand} style={{ marginTop: 40 }} />}
      </PtPageScreen>
    );
  }

  const balance = parseFloat(e.balance);
  const target = parseFloat(e.target ?? '') || 0;
  const n = (e.rules.keyholders?.length ?? 0) + 1;
  const need = e.rules.required_keyholders ?? 0;
  const fast = e.rules.fast_release;
  const contacts = e.trusted_contacts ?? [];
  const waiting = e.requests.filter((r) => (r.method === 'dual_approval' || r.method === 'rule_change') && r.status === 'pending');
  const canAsk = e.locked && (e.me.can_request_dual || e.me.can_fast_release || e.me.is_keyholder);

  return (
    <PtPageScreen
      title={wallet.name}
      subtitle={`Emergency · ${formatNaira(e.balance)}`}
      onBack={() => navigation.goBack()}
      footer={
        !e.locked && e.me.can_spend ? (
          <PtButton title="Pay from this fund" onPress={() => navigation.navigate('Send', { fromWalletId: walletId })} />
        ) : canAsk ? (
          <PtButton title="Release money" onPress={() => navigation.navigate('EmergencyRelease', { walletId })} />
        ) : null
      }
    >
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 4 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{e.locked ? 'Ready for an emergency' : 'Released — open to spend'}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatMoney(e.balance)}</Text>
        {target ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{`Target ${formatNaira(target)} · ${Math.min(100, Math.round((balance * 100) / target))}%`}</Text>
        ) : null}
      </View>

      {waiting.map((r) => (
        <ReleaseRequestCard key={r.id} walletId={walletId} r={r} myId={me?.id} />
      ))}

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Release rules</PtGroupLabel>
        <PtPanel>
          <PtReviewRow label="Keyholders" value={keyholderNames(e, owner)} onEdit={edit} />
          <PtReviewRow
            label="To release"
            value={need > 0 && n > 1 ? `${need} of ${n} say yes` : 'Only the owner'}
            sub={e.rules.request_expiry_hours ? `Requests expire after ${e.rules.request_expiry_hours} hour${e.rules.request_expiry_hours === 1 ? '' : 's'}` : null}
            onEdit={edit}
          />
          <PtReviewRow
            label="Fast release"
            value={fast ? `Up to ${formatNaira(fast.limit)} with proof` : 'Off'}
            sub={fast ? `Once every ${fast.every_days} days, reviewed after` : 'Every release waits for the keyholders'}
            onEdit={edit}
          />
          <PtReviewRow
            label="Trusted contacts"
            value={contacts.length ? contacts.map((c) => c.name).join(', ') : 'None'}
            sub={contacts.length ? (e.rules.trusted_can_request ? 'Can start a request for you' : 'Kept in the loop') : null}
            onEdit={edit}
            last={!e.rules.pay_directly}
          />
          {e.rules.pay_directly ? <PtReviewRow label="Paid to" value="The hospital or clinic" sub="Bills are paid directly, not to a person" onEdit={edit} last /> : null}
        </PtPanel>
      </View>

      <PtNote tone="attention" icon="lock">
        {e.me.pending_rule_change ? 'A rule change is waiting for the keyholders.' : need > 0 && n > 1 ? `Changing these rules needs ${need} of ${n} keyholders.` : 'Only you can change these rules.'}
      </PtNote>

      <PtButton title="Unlock options, beneficiaries and history" variant="ghost" onPress={() => navigation.navigate('EmergencyCenter', { walletId })} />
    </PtPageScreen>
  );
}
