"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { naira } from "@/lib/format";
import type { AdjustWalletResult } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { FormModal, ModalField } from "./form-modal";

type Direction = "credit" | "debit";

/** Credit or debit a wallet with a reason (creates an admin adjustment txn). */
export function AdjustBalanceModal({
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
  const [direction, setDirection] = useState<Direction>("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 0.01;
  const invalid = !validAmount || reason.trim() === "";

  const mutation = useMutation({
    mutationFn: () =>
      api<AdjustWalletResult>(`/api/v1/admin/wallets/${walletId}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          direction,
          amount: numericAmount,
          reason: reason.trim(),
        }),
      }),
    onSuccess: () =>
      onSuccess(
        `Wallet ${direction === "credit" ? "credited" : "debited"} ${naira(numericAmount)}.`,
      ),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <FormModal
      title="Adjust balance"
      description={
        walletName
          ? `Manually move funds in and out of "${walletName}".`
          : "Manually move funds in and out of this wallet."
      }
      error={error}
      busy={mutation.isPending}
      submitLabel={direction === "credit" ? "Credit wallet" : "Debit wallet"}
      submitVariant={direction === "credit" ? "primary" : "danger"}
      submitDisabled={invalid}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <ModalField label="Direction">
        <div className="grid grid-cols-2 gap-2">
          {(["credit", "debit"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition-colors",
                direction === d
                  ? d === "credit"
                    ? "border-brand bg-mint/10 text-brand"
                    : "border-danger bg-danger/10 text-danger"
                  : "border-line text-muted hover:bg-rowhover",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </ModalField>

      <ModalField
        label="Amount"
        htmlFor="adjust-amount"
        hint="Naira. Debits fail if the wallet has insufficient balance or is frozen."
      >
        <Input
          id="adjust-amount"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </ModalField>

      <ModalField label="Reason" htmlFor="adjust-reason">
        <Input
          id="adjust-reason"
          placeholder="e.g. Goodwill refund for failed transfer"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
        />
      </ModalField>

      {reason.trim() ? (
        <p className="rounded-lg bg-lavender/30 px-3 py-2 text-xs text-muted">
          Transaction note:{" "}
          <span className="font-medium text-ink">
            Admin {direction}: {reason.trim()}
          </span>
        </p>
      ) : null}
    </FormModal>
  );
}
