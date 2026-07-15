"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ApiUser } from "@/lib/types";
import { IconClose, IconSearch } from "@/components/icons";

function initials(u: ApiUser): string {
  const a = u.first_name?.[0] ?? u.full_name?.[0] ?? u.email?.[0] ?? "?";
  const b = u.last_name?.[0] ?? "";
  return (a + b).toUpperCase();
}

/**
 * Top-bar global user search. Debounced lookup against the admin users
 * endpoint; renders a keyboard-navigable dropdown of matches that route to
 * the user detail page. Closes on Escape, blur (outside click) and select.
 */
export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Debounce the free-text term so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const enabled = term.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term],
    queryFn: () =>
      api<{ users: ApiUser[] }>(`/api/v1/admin/users${qs({ search: term })}`),
    enabled,
    staleTime: 30_000,
  });

  const results = enabled ? (data?.users ?? []) : [];

  // Reset the highlighted row whenever the query changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [term]);

  // Close when clicking outside the search widget.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function selectUser(user: ApiUser) {
    setOpen(false);
    setInput("");
    setTerm("");
    inputRef.current?.blur();
    router.push(`/users/${user.id}`);
  }

  function clearInput() {
    setInput("");
    setTerm("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        selectUser(results[activeIndex]);
      }
    }
  }

  const showDropdown = open && enabled;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search users by name or email…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-listbox"
          aria-autocomplete="list"
          aria-label="Search users"
          className={cn(
            "h-10 w-full rounded-lg border border-line bg-page/70 pl-9 pr-9 text-sm text-ink transition-colors",
            "placeholder:text-muted/70 hover:border-lavender focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20",
          )}
        />
        {input ? (
          <button
            type="button"
            onClick={clearInput}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-rowhover hover:text-ink"
          >
            <IconClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="animate-pop absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          {isFetching && results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">
              No users match “{term}”.
            </div>
          ) : (
            <ul
              id="global-search-listbox"
              role="listbox"
              className="max-h-80 overflow-y-auto py-1"
            >
              {results.map((u, i) => (
                <li key={u.id} role="option" aria-selected={i === activeIndex}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectUser(u)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      i === activeIndex ? "bg-rowhover" : "hover:bg-rowhover",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                      {initials(u)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {u.full_name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {u.email}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-lavender/50 px-2 py-0.5 text-[11px] font-semibold text-navy ring-1 ring-inset ring-lavender">
                      Tier {u.kyc_tier}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
