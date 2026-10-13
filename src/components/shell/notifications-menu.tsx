"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { z } from "zod";
import { readNotifications } from "@/actions/notifications";

const schema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        batchId: z.uuid(),
        kind: z.enum(["completed", "review"]),
        count: z.number().int().min(0),
        readAt: z.string().nullable(),
        title: z.string(),
      }),
    )
    .max(20),
  unread: z.number().int().min(0),
});

export function NotificationsMenu() {
  const [data, setData] = useState<z.infer<typeof schema>>({
    items: [],
    unread: 0,
  });
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("NotificationLookup");
        const parsed = schema.parse(await response.json());
        if (active) {
          setData(parsed);
          setError("");
        }
      } catch (e) {
        if (active && !(e instanceof DOMException && e.name === "AbortError"))
          setError("Не удалось обновить уведомления.");
      }
    }
    void load();
    const timer = setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  async function markRead() {
    setBusy(true);
    try {
      const ids = data.items.filter((n) => !n.readAt).map((n) => n.id);
      const result = await readNotifications(ids);
      if ("error" in result)
        setError(result.error ?? "Не удалось обновить уведомления.");
      else
        setData((current) => ({
          ...current,
          items: current.items.map((n) => ({
            ...n,
            readAt: n.readAt ?? new Date().toISOString(),
          })),
          unread: Math.max(0, current.unread - ids.length),
        }));
    } catch {
      setError("Не удалось обновить уведомления.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div ref={container} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={
          data.unread
            ? `Уведомления: ${data.unread} непрочитанных`
            : "Уведомления"
        }
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="relative flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-4" aria-hidden="true" />
        {data.unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id={id}
          aria-label="Уведомления"
          className="fixed top-16 right-4 left-4 z-40 max-h-[70vh] overflow-y-auto rounded-lg border bg-card shadow-lg sm:absolute sm:top-full sm:right-0 sm:left-auto sm:mt-2 sm:w-80"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <h2 className="text-sm font-semibold">Уведомления</h2>
            {data.items.some((n) => !n.readAt) && (
              <button
                type="button"
                disabled={busy}
                onClick={markRead}
                className="min-h-8 text-xs text-primary disabled:opacity-50"
              >
                Прочитать показанные
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="p-4 text-xs text-destructive">
              {error}
            </p>
          )}
          {data.items.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Пока нет уведомлений.
            </p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id} className="border-b last:border-0">
                  <Link
                    href={`/grading/${n.batchId}/${n.kind === "completed" ? "results" : "review"}`}
                    onClick={() => setOpen(false)}
                    className="block p-4 hover:bg-secondary"
                  >
                    <p className="text-sm font-medium">
                      {!n.readAt && (
                        <span
                          aria-label="Не прочитано"
                          className="mr-2 inline-block size-1.5 rounded-full bg-primary"
                        />
                      )}
                      {n.kind === "completed"
                        ? `Завершена проверка: ${n.count} работ`
                        : n.count === 0
                          ? "Спорные ответы рассмотрены"
                          : `Требуют внимания: ${n.count} ответов`}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {n.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t p-3 text-[11px] text-muted-foreground">
            Последние 20 уведомлений.{" "}
            <Link href="/grading" className="text-primary underline">
              Все проверки
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
