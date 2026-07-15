"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReverseTransactionResult } from "@/lib/types";
import { FormModal, ModalField } from "./form-modal";

/** Reverse a successful transaction, writing a compensating entry. */
export function ReverseModal({
  transactionId,
  reference,
  onClose,
  onSuccess,
}: {
  transactionId: string | number;
  reference?: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<ReverseTransactionResult>(
        `/api/v1/admin/transactions/${transactionId}/reverse`,
        {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() }),
        },
      ),
    onSuccess: () => onSuccess("Transaction reversed."),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <FormModal
      title="Reverse transaction"
      description={
        reference
          ? `A compensating entry undoes ${reference}. The original row is preserved.`
          : "A compensating entry undoes this transaction. The original row is preserved."
      }
      error={error}
      busy={mutation.isPending}
      submitLabel="Reverse transaction"
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
        htmlFor="reverse-reason"
        hint="Shared with the wallet owner in their notification."
      >
        <textarea
          id="reverse-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Reason for reversal..."
          autoFocus
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </ModalField>
    </FormModal>
  );
}
