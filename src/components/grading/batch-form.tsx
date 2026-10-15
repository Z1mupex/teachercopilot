"use client";
import { useActionState } from "react";
import { createGradingBatch } from "@/actions/grading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/worksheets/labels";

export function BatchForm({
  classes,
  worksheets,
}: {
  classes: { id: string; name: string }[];
  worksheets: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState(createGradingBatch, {});
  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <label className="block space-y-2 text-sm font-medium">
        Название проверки
        <Input
          name="title"
          required
          maxLength={160}
          placeholder="Например, Контрольная работа — Unit 4"
          disabled={pending}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-medium">
          Класс <span className="text-muted-foreground">(необязательно)</span>
          <select name="class_id" className={selectClass} disabled={pending}>
            <option value="">Без класса</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Рабочий лист{" "}
          <span className="text-muted-foreground">(необязательно)</span>
          <select
            name="worksheet_id"
            className={selectClass}
            disabled={pending}
          >
            <option value="">Внешние работы — без рабочего листа</option>
            {worksheets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="rounded-xl bg-secondary p-4 text-sm leading-6 text-muted-foreground">
        Можно загрузить любые работы учеников, в том числе созданные вне Teacher
        Copilot. После загрузки можно объединить несколько листов одного ученика
        в одну работу.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Создаём проверку…" : "Создать и загрузить работы"}
      </Button>
    </form>
  );
}
