"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CrisisUnlockResult } from "@/lib/types";
import { FormModal, ModalField } from "./form-modal";

/**
 * National-crisis override: unlock an emergency wallet on Patriai's say-so.
 * Only offered when the owner opted in; the reason goes to the audit log.
 */
export function CrisisUnlockModal({
  walletId,
  walletName,
  onClose,
  onSuccess,
}: {
  walletId: string | number;
  walletName?: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<CrisisUnlockResult>(`/api/v1/admin/wallets/${walletId}/emergency/crisis-unlock`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      }),
    onSuccess: () => onSuccess("National-crisis override applied — wallet unlocked."),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <FormModal
      title="National-crisis override"
      description={`Unlocks ${walletName ? `"${walletName}"` : "this wallet"} now so its beneficiaries can withdraw within their limits. The owner opted in to this override; the owner and beneficiaries are notified.`}
      error={error}
      busy={mutation.isPending}
      submitLabel="Unlock wallet"
      submitVariant="danger"
      submitDisabled={reason.trim() === ""}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <ModalField
        label="Reason"
        htmlFor="crisis-reason"
        hint="Recorded in the wallet's audit log."
      >
        <textarea
          id="crisis-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="e.g. Federal government declared a state of emergency"
          autoFocus
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </ModalField>
    </FormModal>
  );
}
