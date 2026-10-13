"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteWorksheet } from "@/actions/worksheets";
import { Button } from "@/components/ui/button";
import { secondaryButtonClass } from "./labels";

export function DeleteWorksheetDialog({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
          cancel.current?.focus();
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Удалить
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-worksheet-title"
        aria-describedby="delete-worksheet-description"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => trigger.current?.focus()}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl backdrop:bg-black/50"
      >
        <h2
          id="delete-worksheet-title"
          className="break-words text-xl font-semibold"
        >
          Удалить «{title}»?
        </h2>
        <p
          id="delete-worksheet-description"
          className="mt-3 text-sm leading-6 text-muted-foreground"
        >
          Рабочий лист, задания и ключи ответов будут удалены. Это действие
          нельзя отменить.
        </p>
        <form
          className="mt-6 space-y-4"
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setError(null);
              try {
                const result = await deleteWorksheet(id, "delete");
                if ("error" in result) setError(result.error);
                else {
                  dialog.current?.close();
                  router.push("/worksheets?deleted=1");
                  router.refresh();
                }
              } catch {
                setError(
                  "Не удалось удалить рабочий лист. Попробуйте ещё раз.",
                );
              }
            });
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              ref={cancel}
              type="button"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              className={secondaryButtonClass}
            >
              Отмена
            </button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {pending ? "Удаляем…" : "Подтвердить удаление"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
