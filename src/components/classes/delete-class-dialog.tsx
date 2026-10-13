"use client";

import { useActionState, useRef } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteClass } from "@/actions/classes";
import { Button } from "@/components/ui/button";
import type { ClassFormState } from "@/types/classes";

const initialState: ClassFormState = {};

export function DeleteClassDialog({ id, name }: { id: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [state, action, pending] = useActionState(
    deleteClass.bind(null, id),
    initialState,
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          cancel.current?.focus();
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Удалить класс
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-class-title"
        aria-describedby="delete-class-description"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => trigger.current?.focus()}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl backdrop:bg-black/50"
      >
        <div className="mb-5 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Trash2 className="size-6" aria-hidden="true" />
        </div>
        <h2
          id="delete-class-title"
          className="break-words text-xl font-semibold"
        >
          Удалить класс «{name}»?
        </h2>
        <p
          id="delete-class-description"
          className="mt-3 text-sm leading-6 text-muted-foreground"
        >
          Класс будет удалён из вашего списка. История проверок сохранится.
          Удаление нельзя отменить.
        </p>
        <form action={action} className="mt-6 space-y-4" aria-busy={pending}>
          <input type="hidden" name="confirmation" value="delete" />
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              ref={cancel}
              type="button"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              className="min-h-11 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
