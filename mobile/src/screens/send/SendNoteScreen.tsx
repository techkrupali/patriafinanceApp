import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills } from '../../components/pt/PtForm';
import { RepeatRow } from './SendAmountScreen';
import { useBudget } from '../../api/hooks';
import { useSendDraft } from '../../store/sendDraft';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/**
 * SND-07 Add a note: what the recipient sees, and which budget it comes out of
 * when paying from a spending wallet (SPD "Food and market · ₦32,000 left").
 */
export function SendNoteScreen({ navigation }: RootScreenProps<'SendNote'>) {
  const { recipient, amount, note, setNote, categoryId, setCategory, fromWalletId } = useSendDraft();
  const budget = useBudget(fromWalletId ?? 0, Boolean(fromWalletId));
  const cats = budget.data?.categories ?? [];
  const picked = cats.find((c) => c.id === categoryId);
  const left = picked ? parseFloat(picked.limit) - parseFloat(picked.spent) : null;
  const n = parseFloat(amount) || 0;
  const first = recipient?.name.split(' ')[0] ?? 'They';

  return (
    <PtPageScreen
      title="Add a note"
      subtitle={recipient ? `${formatNaira(String(n))} to ${first}` : null}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Review" onPress={() => navigation.navigate('SendReview')} disabled={cats.length > 0 && !picked} />}
    >
      <PtField label={`Note (${first} will see it)`} value={note} onChangeText={setNote} placeholder="Market for the week" maxLength={200} />
      {budget.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : cats.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Category</PtGroupLabel>
          <PtPills compact options={cats.map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={setCategory} />
          {picked && left !== null ? (
            <PtNote tone={left - n < 0 ? 'attention' : 'info'}>
              {left - n < 0
                ? `${picked.name} has ${formatNaira(String(Math.max(0, left)))} left this month. Going over may need an owner's yes.`
                : `${picked.name}: ${formatNaira(String(left))} left this month, ${formatNaira(String(left - n))} after this.`}
            </PtNote>
          ) : null}
        </View>
      ) : null}
      {recipient && recipient.kind !== 'wallet' && recipient.kind !== 'request' ? (
        <PtPanel>
          <RepeatRow onPress={() => navigation.navigate('SendSchedule')} />
        </PtPanel>
      ) : null}
    </PtPageScreen>
  );
}
