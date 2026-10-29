"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/api";

/**
 * A private upload (an ID, a CAC certificate, a director's selfie) that the
 * API only serves to an admin with a token, so a plain <img src> can't load
 * it. Fetches it with the token and shows the image, or a link for a PDF.
 */
export function SecureFile({ url, name, pdf = false }: { url: string; name: string; pdf?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = getToken();
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (failed) return <span className="text-xs text-danger">Could not load {name}</span>;
  if (!src) return <span className="block h-24 w-32 animate-pulse rounded-lg bg-lavender/60" aria-label={`Loading ${name}`} />;
  if (pdf) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand hover:underline">
        Open {name}
      </a>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" title={`Open ${name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL, not an optimisable asset */}
      <img src={src} alt={name} className="h-24 w-32 rounded-lg object-cover ring-1 ring-line" />
    </a>
  );
}
