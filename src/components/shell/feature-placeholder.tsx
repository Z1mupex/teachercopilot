import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export function FeaturePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
      <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center">
        <span className="mb-5 rounded-2xl bg-secondary p-4 text-primary">
          <BookOpen className="size-8" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-semibold">Раздел готовится</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Этот инструмент появится в одном из следующих обновлений. Сейчас можно
          вернуться на панель.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium text-primary hover:bg-secondary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          На панель
        </Link>
      </div>
    </div>
  );
}
