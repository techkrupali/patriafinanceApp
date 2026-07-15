"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BroadcastResult } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { FormModal, ModalField } from "./form-modal";

/**
 * Push an in-app notification. When `user` is provided the message is
 * locked to that recipient; otherwise it broadcasts to every user.
 */
export function BroadcastModal({
  user,
  onClose,
  onSuccess,
}: {
  user?: { id: number; name: string };
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<BroadcastResult>(`/api/v1/admin/notifications/broadcast`, {
        method: "POST",
        body: JSON.stringify(
          user
            ? { title: title.trim(), body: body.trim(), target: "user", user_id: user.id }
            : { title: title.trim(), body: body.trim(), target: "all" },
        ),
      }),
    onSuccess: (res) =>
      onSuccess(
        user
          ? `Message sent to ${user.name}.`
          : `Broadcast sent to ${res.sent.toLocaleString()} user${res.sent === 1 ? "" : "s"}.`,
      ),
    onError: (err: Error) => setError(err.message),
  });

  const invalid = title.trim() === "" || body.trim() === "";

  return (
    <FormModal
      title={user ? "Send message" : "Broadcast to all users"}
      description={
        user
          ? `Delivered to ${user.name} as an in-app notification.`
          : "Delivered to every user as an in-app notification."
      }
      error={error}
      busy={mutation.isPending}
      submitLabel={user ? "Send message" : "Send broadcast"}
      submitDisabled={invalid}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <ModalField label="Title" htmlFor="broadcast-title">
        <Input
          id="broadcast-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Notification title"
          autoFocus
        />
      </ModalField>
      <ModalField label="Message" htmlFor="broadcast-body">
        <textarea
          id="broadcast-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="What would you like to say?"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </ModalField>
    </FormModal>
  );
}
