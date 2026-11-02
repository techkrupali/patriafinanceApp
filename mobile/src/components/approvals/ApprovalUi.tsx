import React, { useState } from 'react';
import { useRespondApproval } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { PinSheet } from '../PinSheet';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { ApprovalRequest } from '../../api/types';

/** APR-03 "Approve for Tolu · ₦15,000 · School trip to Olumo Rock": the PIN, then the outcome. */
export function ApprovePinSheet({ approval, onDone, onClose }: { approval: ApprovalRequest | null; onDone: (id: number) => void; onClose: () => void }) {
  if (!approval) return null;
  return <Sheet key={approval.id} approval={approval} onDone={onDone} onClose={onClose} />;
}

function Sheet({ approval, onDone, onClose }: { approval: ApprovalRequest; onDone: (id: number) => void; onClose: () => void }) {
  const respond = useRespondApproval(approval.id);
  const [error, setError] = useState<string | null>(null);
  const first = (approval.initiator?.name ?? 'them').split(' ')[0];

  return (
    <PinSheet
      visible
      title={approval.acting_for ? `Approve for ${approval.acting_for}` : `Approve for ${first}`}
      subtitle={approval.description ?? approval.wallet?.name}
      amount={approval.governance ? undefined : formatNaira(approval.amount)}
      loading={respond.isPending}
      error={error}
      onSubmit={(pin) => {
        setError(null);
        respond.mutate(
          { decision: 'approve', pin },
          {
            onSuccess: () => {
              notifySuccess();
              onDone(approval.id);
            },
            onError: (e) => {
              const err = e as ApiError;
              if (err.errors?.pin) setError(err.errors.pin[0]);
              else {
                onClose();
                showAlert('Not approved', err.message);
              }
            },
          },
        );
      }}
      onClose={onClose}
    />
  );
}
