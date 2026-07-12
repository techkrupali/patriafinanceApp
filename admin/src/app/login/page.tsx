"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { LoginData } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PatriaiMark } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const { token, user, hydrated, hydrate, setSession } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Already signed in as an admin? Go straight to the dashboard.
  useEffect(() => {
    if (hydrated && token && user?.role === "admin") {
      router.replace("/");
    }
  }, [hydrated, token, user, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api<LoginData>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });

      if (data.user.role !== "admin") {
        setError("Not an admin account");
        return;
      }

      setSession(data.token, data.user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center">
          <PatriaiMark className="h-12 w-12 text-xl" />
          <h1 className="mt-4 text-xl font-bold text-ink">Patriai Admin</h1>
          <p className="mt-1 text-sm text-muted">Sign in to manage the platform</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-xs font-semibold text-ink">
              Email or phone
            </label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              placeholder="admin@patriai.app"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-ink">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
