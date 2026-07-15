"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { naira } from "@/lib/format";
import type { LoanDetail, UserDetailData } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormModal, ModalField } from "./form-modal";

/**
 * Recover funds against a borrower's wallet to settle an outstanding loan.
 * The recovery wallet must belong to the borrower, so we load their wallets
 * from the user detail endpoint and offer them in a picker (falling back to a
 * raw wallet-id input when the borrower or their wallets can't be resolved).
 */
export function RecoverLoanModal({
  loanId,
  userId,
  reference,
  outstanding,
  onClose,
  onSuccess,
}: {
  loanId: string | number;
  userId: number | null;
  reference?: string;
  outstanding?: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: userData, isPending: walletsPending } = useQuery({
    queryKey: ["admin", "user", userId != null ? String(userId) : "none"],
    queryFn: () => api<UserDetailData>(`/api/v1/admin/users/${userId}`),
    enabled: userId != null,
  });

  const wallets = userData?.wallets ?? [];
  const usePicker = userId != null && (walletsPending || wallets.length > 0);

  const numericAmount = Number(amount);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 0.01;
  const invalid = !validAmount || walletId.trim() === "";

  const mutation = useMutation({
    mutationFn: () =>
      api<{ loan: LoanDetail }>(`/api/v1/admin/loans/${loanId}/recover`, {
        method: "POST",
        body: JSON.stringify({
          wallet_id: Number(walletId),
          amount: numericAmount,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      }),
    onSuccess: () => onSuccess(`Recovered ${naira(numericAmount)} from the borrower.`),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <FormModal
      title="Recover funds"
      description={
        reference
          ? `Pull funds from one of the borrower's wallets to settle ${reference}.`
          : "Pull funds from one of the borrower's wallets to settle this loan."
      }
      error={error}
      busy={mutation.isPending}
      submitLabel="Recover funds"
      submitVariant="danger"
      submitDisabled={invalid}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <ModalField
        label="Borrower wallet"
        htmlFor="recover-wallet"
        hint="Funds are debited from this wallet. It must belong to the borrower."
      >
        {usePicker ? (
          <Select
            id="recover-wallet"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            disabled={walletsPending}
          >
            <option value="">
              {walletsPending ? "Loading wallets..." : "Select a wallet"}
            </option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {naira(w.balance)}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id="recover-wallet"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="Wallet ID"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
          />
        )}
      </ModalField>

      <ModalField
        label="Amount"
        htmlFor="recover-amount"
        hint={
          outstanding
            ? `Naira. Outstanding: ${naira(outstanding)}. Debits fail on insufficient balance.`
            : "Naira. Debits fail if the wallet has insufficient balance."
        }
      >
        <Input
          id="recover-amount"
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

      <ModalField label="Reason" htmlFor="recover-reason" hint="Optional.">
        <Input
          id="recover-reason"
          placeholder="e.g. Recovery against defaulted loan"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
        />
      </ModalField>
    </FormModal>
  );
}
