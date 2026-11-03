import React, { useState } from 'react';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtGroupLabel, PtNote, PtPills } from '../../components/pt/PtForm';
import { useCreateCircle } from '../../api/circles';
import { useFamily } from '../../api/hooks';
import { useCircleStore } from '../../store/circle';
import { notifySuccess } from '../../lib/haptics';
import { pt } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';

const KINDS = [
  { value: 'extended', label: 'Extended family' },
  { value: 'siblings', label: 'Siblings' },
  { value: 'ajo', label: 'Ajo group' },
  { value: 'friends', label: 'Friends' },
  { value: 'community', label: 'Church or community' },
];

/**
 * FAM-11 "New circle: a separate group with its own wallets". Each circle
 * keeps its own members, wallets and rules; nothing is shared with your
 * family unless you move it.
 */
export function NewCircleScreen({ navigation }: RootScreenProps<'NewCircle'>) {
  const home = useFamily();
  const create = useCreateCircle();
  const setCircle = useCircleStore((s) => s.setCircle);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('siblings');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState<string | null>(null);
  const family = home.data?.circle?.name ?? 'your family';

  const submit = () => {
    setError(null);
    if (name.trim().length < 2) return setError('Give the circle a name.');
    create.mutate(
      { name: name.trim(), kind, purpose: purpose.trim() || undefined },
      {
        onSuccess: (r) => {
          notifySuccess();
          setCircle(r.circle.id);
          // "Create and invite people": the new circle, then who joins it.
          navigation.replace('InviteRole', { circleId: r.circle.id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title="New circle"
      subtitle="A separate group with its own wallets"
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton title="Create and invite people" loading={create.isPending} onPress={submit} />
        </>
      }
    >
      <PtField label="Circle name" value={name} onChangeText={setName} placeholder="Eze siblings" maxLength={60} autoCapitalize="words" />
      <PtGroupLabel>What kind</PtGroupLabel>
      <PtPills options={KINDS} value={kind} onChange={setKind} />
      <PtField label="What is it for (optional)" value={purpose} onChangeText={setPurpose} placeholder="Looking after Mama and the family house" maxLength={160} />
      <PtNote icon="lock">{`Each circle keeps its own members, wallets and rules. Nothing is shared with the ${family} unless you move it.`}</PtNote>
    </PtPageScreen>
  );
}
