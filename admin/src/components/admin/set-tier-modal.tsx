"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { kycTierName } from "@/lib/format";
import type { ApiUser } from "@/lib/types";
import { FormModal } from "./form-modal";

const TIERS = [0, 1, 2, 3] as const;

function tierName(tier: number): string {
  return tier === 0 ? "Unverified" : kycTierName(tier);
}

/** Manually set a user's KYC tier (0–3). */
export function SetTierModal({
  userId,
  currentTier,
  onClose,
  onSuccess,
}: {
  userId: string | number;
  currentTier: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [tier, setTier] = useState(currentTier);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ user: ApiUser }>(`/api/v1/admin/users/${userId}/kyc-tier`, {
        method: "PATCH",
        body: JSON.stringify({ tier }),
      }),
    onSuccess: () => onSuccess(`KYC tier set to Tier ${tier}.`),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <FormModal
      title="Set KYC tier"
      description="Manually override the user's verification tier. They are notified of the change."
      error={error}
      busy={mutation.isPending}
      submitLabel="Set tier"
      submitDisabled={tier === currentTier}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <fieldset className="grid grid-cols-1 gap-2">
        {TIERS.map((t) => (
          <label
            key={t}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
              tier === t
                ? "border-brand bg-mint/10"
                : "border-line hover:bg-rowhover",
            )}
          >
            <input
              type="radio"
              name="kyc-tier"
              value={t}
              checked={tier === t}
              onChange={() => setTier(t)}
              className="h-4 w-4 accent-brand"
            />
            <span className="text-sm">
              <span className="font-semibold text-ink">Tier {t}</span>
              <span className="text-muted"> · {tierName(t)}</span>
              {t === currentTier ? (
                <span className="text-muted"> (current)</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
    </FormModal>
  );
}
