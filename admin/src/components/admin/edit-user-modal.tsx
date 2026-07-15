"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiUser } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { FormModal, ModalField } from "./form-modal";

/** Edit a user's core profile fields. */
export function EditUserModal({
  userId,
  user,
  onClose,
  onSuccess,
}: {
  userId: string | number;
  user: Pick<ApiUser, "first_name" | "last_name" | "phone" | "email">;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [phone, setPhone] = useState(user.phone);
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ user: ApiUser }>(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
        }),
      }),
    onSuccess: () => onSuccess("Profile updated."),
    onError: (err: Error) => setError(err.message),
  });

  const invalid =
    firstName.trim() === "" ||
    lastName.trim() === "" ||
    phone.trim() === "" ||
    email.trim() === "";

  return (
    <FormModal
      title="Edit profile"
      description="Update this user's name and contact details."
      error={error}
      busy={mutation.isPending}
      submitLabel="Save changes"
      submitDisabled={invalid}
      onSubmit={() => {
        setError(null);
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <ModalField label="First name" htmlFor="edit-first">
          <Input
            id="edit-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoFocus
          />
        </ModalField>
        <ModalField label="Last name" htmlFor="edit-last">
          <Input
            id="edit-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </ModalField>
      </div>
      <ModalField label="Phone" htmlFor="edit-phone">
        <Input
          id="edit-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
        />
      </ModalField>
      <ModalField label="Email" htmlFor="edit-email">
        <Input
          id="edit-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </ModalField>
    </FormModal>
  );
}
