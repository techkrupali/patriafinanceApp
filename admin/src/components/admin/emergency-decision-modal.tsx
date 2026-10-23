"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { naira } from "@/lib/format";
import type { AdminEmergencyRequest } from "@/lib/types";
import { FormModal, ModalField } from "./form-modal";

/**
 * Verify or reject the death certificate / legal notice on an emergency
 * unlock request. Verifying unlocks the wallet for its beneficiaries, so the
 * copy spells that out; rejecting needs a reason for the requester.
 */
export function EmergencyDecisionModal({
  decision,
  requestId,
  walletName,
  walletBalance,
  recipientCount,
  onClose,
  onSuccess,
}: {
  decision: "approve" | "reject";
  requestId: string | number;
  walletName?: string;
  walletBalance?: string;
  recipientCount: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const approving = decision === "approve";

  const mutation = useMutation({
    mutationFn: () =>
      api<{ request: AdminEmergencyRequest }>(
        `/api/v1/admin/emergency-requests/${requestId}/${decision}`,
        {
          method: "POST",
          body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
        },
      ),
    onSuccess: () =>
      onSuccess(approving ? "Document verified — wallet unlocked." : "Request rejected."),
    onError: (err: Error) => setError(err.message),
  });

  const wallet = walletName ? `"${walletName}"` : "this wallet";
  const balance = walletBalance != null ? ` (${naira(walletBalance)})` : "";
  const recipients =
    recipientCount > 0
      ? `its ${recipientCount} beneficiar${recipientCount === 1 ? "y" : "ies"}`
      : "its beneficiaries";

  return (
    <FormModal
      title={approving ? "Verify document and unlock wallet?" : "Reject this document?"}
      description={
        approving
          ? `Approving unlocks ${wallet}${balance} immediately and lets ${recipients} withdraw within their limits. Other pending unlock requests are cancelled and the owner and recipients are notified.`
          : "The wallet stays locked. The requester is told Patriai could not verify the document."
      }
      error={error}
      busy={mutation.isPending}
      submitLabel={approving ? "Verify & unlock" : "Reject document"}
      submitVariant={approving ? "primary" : "danger"}
      submitDisabled={!approving && note.trim() === ""}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <ModalField
        label={approving ? "Note" : "Reason"}
        htmlFor="emergency-note"
        hint={
          approving
            ? "Optional. Saved on the request as the review note."
            : "Required. Shared with the requester in their notification."
        }
      >
        <textarea
          id="emergency-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={approving ? "e.g. Certificate checked against registry" : "Reason for rejection..."}
          autoFocus
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </ModalField>
    </FormModal>
  );
}
