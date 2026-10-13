"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";

import { logout } from "@/actions/auth";
import type { AuthFormState } from "@/types/auth";

const initialState: AuthFormState = {};

export function ProfileDropdown({
  displayName,
  email,
}: {
  displayName: string;
  email?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(logout, initialState);
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        ref={toggle}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Профиль: ${displayName}`}
        className="flex min-h-11 items-center gap-2 rounded-md px-2 text-left transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className="flex size-8 items-center justify-center rounded-full border bg-card text-[11px] font-semibold text-primary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="hidden md:block">
          <span className="block max-w-40 truncate text-[13px] font-medium">
            {displayName}
          </span>
        </span>
        <ChevronDown
          className="hidden size-3.5 text-muted-foreground sm:block"
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={id}
          className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border bg-card p-2 shadow-lg"
        >
          <div className="border-b px-3 py-3">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {email && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {email}
              </p>
            )}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-secondary"
          >
            <Settings className="size-4" aria-hidden="true" />
            Настройки
          </Link>
          <form action={action}>
            <p className="px-3 pt-2 text-xs leading-5 text-muted-foreground">
              При выходе несохранённые страницы будут удалены из этого браузера.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {pending ? "Выходим…" : "Выйти"}
            </button>
          </form>
          {state.error && (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {state.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
