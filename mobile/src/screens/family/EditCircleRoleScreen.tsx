import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtDivider, PtNote, PtPanel, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useCircleMember, useSetCircleRole, type CirclePerm, type CircleRole } from '../../api/circles';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** What each role starts with (CircleMember::DEFAULTS on the server). */
const DEFAULTS: Record<CircleRole, Record<CirclePerm, boolean>> = {
  co_owner: { approve: true, send: true, invite: true, rules: true, balances: false },
  admin: { approve: true, send: false, invite: true, rules: false, balances: false },
  contributor: { approve: false, send: false, invite: false, rules: false, balances: false },
};

/**
 * FAM-08 "Edit role": Co-owner / Admin / Contributor, and what that allows
 * across the circle. Carried into each wallet you own; a joint partner's role
 * only changes with their agreement.
 */
export function EditCircleRoleScreen({ navigation, route }: RootScreenProps<'EditCircleRole'>) {
  const { circleId, userId } = route.params;
  const q = useCircleMember(circleId, userId);
  const save = useSetCircleRole(circleId, userId);
  const [role, setRole] = useState<CircleRole>('contributor');
  const [perms, setPerms] = useState<Record<CirclePerm, boolean>>(DEFAULTS.contributor);
  const [ready, setReady] = useState(false);
  const d = q.data;

  useEffect(() => {
    if (!d || ready) return;
    const r = (['co_owner', 'admin', 'contributor'].includes(d.role) ? d.role : 'contributor') as CircleRole;
    setRole(r);
    setPerms(d.permissions);
    setReady(true);
  }, [d, ready]);

  if (!d) {
    return (
      <PtPageScreen title="Edit role" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const first = d.person.first_name;
  const joint = d.wallets.some((w) => w.wallet_type === 'joint');
  const rows: { key: CirclePerm; title: string; sub: string }[] = [
    { key: 'approve', title: 'Approve payments', sub: role === 'contributor' ? 'Turns them into an approver' : `On wallets ${first} ${role === 'co_owner' ? 'co-owns' : 'helps run'}` },
    { key: 'send', title: 'Send from shared wallets', sub: "Up to each wallet's limit" },
    { key: 'invite', title: 'Invite and remove people', sub: 'Except the owner' },
    { key: 'rules', title: 'Change rules and limits', sub: 'Changes still need your yes' },
    { key: 'balances', title: 'See all balances', sub: 'Including Main' },
  ];

  return (
    <PtPageScreen
      title="Edit role"
      subtitle={d.person.name}
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Save changes"
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              { role, permissions: perms },
              {
                onSuccess: (r) => {
                  notifySuccess();
                  const skipped = r.skipped.map((s) => `${s.wallet}: ${s.reason}`).join('\n');
                  showAlert('Saved', skipped ? `Some wallets stay as they were.\n${skipped}` : `${first} can see what changed.`);
                  navigation.goBack();
                },
                onError: (e) => showAlert('Not saved', e.message),
              },
            )
          }
        />
      }
    >
      <PtSegmented
        options={[
          { value: 'co_owner' as CircleRole, label: 'Co-owner' },
          { value: 'admin' as CircleRole, label: 'Admin' },
          { value: 'contributor' as CircleRole, label: 'Contributor' },
        ]}
        value={role}
        onChange={(r) => {
          setRole(r);
          setPerms(DEFAULTS[r]);
        }}
      />
      <PtPanel>
        {rows.map((r, i) => (
          <View key={r.key}>
            {i > 0 ? <PtDivider /> : null}
            <Pressable
              onPress={() => {
                selection();
                setPerms((p) => ({ ...p, [r.key]: !p[r.key] }));
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: perms[r.key] }}
              accessibilityLabel={`${r.title}. ${r.sub}`}
            >
              <PtSwitchRow title={r.title} subtitle={r.sub} right={<PtCheckbox checked={perms[r.key]} />} />
            </Pressable>
          </View>
        ))}
      </PtPanel>
      {joint ? <PtNote icon="lock">{`Lowering ${first}'s role on a joint wallet needs ${first}'s agreement. That keeps joint money fair for both of you.`}</PtNote> : null}
    </PtPageScreen>
  );
}
