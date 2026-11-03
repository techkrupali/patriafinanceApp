import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChoiceCard, PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { useDeclineInvite } from '../../api/invites';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const REASONS = ['Not right now', "I can't contribute", "I don't know this person"];

/** INV-03 "Decline Ngozi's invite? We'll let her know. Adding a reason is optional." */
export function DeclineInviteScreen({ navigation, route }: RootScreenProps<'DeclineInvite'>) {
  const { invitationId } = route.params;
  const first = route.params.inviter ?? 'them';
  const decline = useDeclineInvite();
  const [reason, setReason] = useState<string | null>(null);
  const [block, setBlock] = useState(false);

  return (
    <PtPageScreen
      title=""
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton
            title="Decline invite"
            style={{ backgroundColor: pt.danger }}
            loading={decline.isPending}
            onPress={() =>
              decline.mutate(
                { id: invitationId, reason: reason ?? undefined, block },
                {
                  onSuccess: () => {
                    notifySuccess();
                    showAlert('Declined', `We've told ${first}.${block ? ` ${first} can't invite you again.` : ''}`);
                    navigation.popToTop();
                  },
                  onError: (e) => showAlert('Not declined', e.message),
                },
              )
            }
          />
          <PtButton title="Go back" variant="ghost" onPress={() => navigation.goBack()} />
        </>
      }
    >
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, lineHeight: 32, color: pt.ink }} accessibilityRole="header">{`Decline ${first}'s invite?`}</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted }}>{`We'll let ${first} know. Adding a reason is optional.`}</Text>
      <View style={{ gap: 10 }}>
        {REASONS.map((r) => (
          <PtChoiceCard key={r} title={r} selected={reason === r} onPress={() => setReason(reason === r ? null : r)} />
        ))}
      </View>
      <PtPanel>
        <PtSwitchRow title={`Block future invites from ${first}`} subtitle="They won't be able to invite you again" value={block} onChange={setBlock} />
      </PtPanel>
    </PtPageScreen>
  );
}
