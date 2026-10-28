import React from 'react';
import { View } from 'react-native';
import { PtSheet } from '../pt/PtSheet';
import { PtButton } from '../pt/PtButton';
import { PtChip } from '../pt/PtChip';
import { PtPanel, PtReviewRow } from '../pt/PtForm';
import { jointTerms } from '../../lib/joint';
import type { WalletInvitation } from '../../api/types';

/**
 * INV-O1 "Ngozi wants to open a joint wallet with you": the rules the partner
 * accepts, then their PIN (INV-O2).
 */
export function JointTermsSheet({ invitation, onAccept, onClose }: { invitation: WalletInvitation | null; onAccept: () => void; onClose: () => void }) {
  const joint = invitation?.joint;
  const inviter = invitation?.inviter?.name?.split(/\s+/)[0] ?? 'Someone';
  const terms = joint ? jointTerms(joint, true) : [];
  return (
    <PtSheet
      visible={Boolean(invitation && joint)}
      title={`${inviter} wants to open a joint wallet with you.`}
      subtitle={invitation?.wallet?.name}
      onClose={onClose}
      footer={<PtButton title="Accept the rules" onPress={onAccept} />}
    >
      <View style={{ gap: 12 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <PtChip label="You: Co-owner" />
        </View>
        <PtPanel>
          {terms.map((t, i) => (
            <PtReviewRow key={t.label} label={t.label} value={t.value} sub={t.sub} last={i === terms.length - 1} />
          ))}
        </PtPanel>
      </View>
    </PtSheet>
  );
}
