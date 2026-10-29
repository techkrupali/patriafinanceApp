"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Message {
  id: number;
  from: "user" | "support";
  name: string | null;
  body: string;
  reference: string | null;
  created_at: string | null;
}

/** ME-17 Chat with support, from the team's side: the conversation and a reply box. */
export function SupportChat({ requestId, onError }: { requestId: string; onError: (message: string) => void }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const { data, isPending } = useQuery({
    queryKey: ["admin", "support", requestId, "messages"],
    queryFn: () => api<{ messages: Message[] }>(`/api/v1/admin/support-requests/${requestId}/messages`),
    refetchInterval: 15000,
  });
  const reply = useMutation({
    mutationFn: (text: string) =>
      api(`/api/v1/admin/support-requests/${requestId}/messages`, { method: "POST", body: JSON.stringify({ body: text }) }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin", "support", requestId] });
      qc.invalidateQueries({ queryKey: ["admin", "support-requests"] });
    },
    onError: (err: Error) => onError(err.message),
  });
  const messages = data?.messages ?? [];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <span className="text-xs text-muted">The person sees replies in the app</span>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">No chat messages on this request. It was opened from Steward or another screen.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className={m.from === "support" ? "flex justify-end" : "flex justify-start"}>
                <div className={"max-w-[75%] rounded-xl px-3 py-2 text-sm " + (m.from === "support" ? "bg-brand text-white" : "bg-lavender/60 text-ink")}>
                  <p className={"text-xs " + (m.from === "support" ? "text-white/70" : "text-muted")}>
                    {m.from === "support" ? `${m.name ?? "Support"} (you)` : m.name ?? "Customer"} · {formatDateTime(m.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                  {m.reference ? <p className="mt-1 font-mono text-xs opacity-80">Shared {m.reference}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) reply.mutate(body.trim());
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Reply to the customer…"
            aria-label="Reply"
            className="min-h-[44px] flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <Button type="submit" disabled={!body.trim() || reply.isPending}>
            {reply.isPending ? "Sending…" : "Send"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
