"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import { createClass, updateClass } from "@/actions/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClassFormState, TeacherClass } from "@/types/classes";

const initialState: ClassFormState = {};

export function ClassForm({ teacherClass }: { teacherClass?: TeacherClass }) {
  const [state, action, pending] = useActionState(
    teacherClass ? updateClass.bind(null, teacherClass.id) : createClass,
    initialState,
  );
  const fields = [
    {
      name: "name",
      label: "Название класса",
      placeholder: "Например, 8А",
      type: "text",
      maxLength: 100,
      required: true,
      defaultValue: teacherClass?.name ?? "",
    },
    {
      name: "grade",
      label: "Параллель",
      placeholder: "От 1 до 12",
      type: "number",
      min: 1,
      max: 12,
      step: 1,
      defaultValue: teacherClass?.grade ?? "",
    },
    {
      name: "subject",
      label: "Предмет",
      placeholder: "Например, английский язык",
      type: "text",
      maxLength: 120,
      defaultValue: teacherClass?.subject ?? "",
    },
    {
      name: "student_count",
      label: "Количество учеников",
      placeholder: "Например, 28",
      type: "number",
      min: 0,
      max: 2147483647,
      step: 1,
      defaultValue: teacherClass?.student_count ?? "",
    },
  ] as const;
  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <p className="text-sm leading-6 text-muted-foreground">
        Обязательно только название. Остальные поля можно заполнить позже.
      </p>
      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.success}
        </p>
      )}
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
        {fields.map(({ name, label, ...input }) => (
          <div key={name}>
            <label htmlFor={name} className="mb-2 block text-sm font-medium">
              {label}
              {name === "name" && (
                <span aria-hidden="true" className="text-primary">
                  {" "}
                  *
                </span>
              )}
            </label>
            <Input
              id={name}
              name={name}
              {...input}
              aria-invalid={Boolean(state.fieldErrors?.[name])}
              aria-describedby={
                state.fieldErrors?.[name] ? `${name}-error` : undefined
              }
            />
            {state.fieldErrors?.[name]?.[0] && (
              <p id={`${name}-error`} className="mt-2 text-sm text-destructive">
                {state.fieldErrors[name][0]}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4 border-t pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {pending
            ? "Сохраняем…"
            : teacherClass
              ? "Сохранить изменения"
              : "Создать класс"}
        </Button>
        <Link
          href="/classes"
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          К списку классов
        </Link>
      </div>
    </form>
  );
}
