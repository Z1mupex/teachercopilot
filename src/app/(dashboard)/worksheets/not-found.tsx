import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function WorksheetNotFound() {
  return (
    <div className="rounded-2xl border bg-card px-6 py-14 text-center">
      <FileQuestion
        className="mx-auto mb-5 size-12 text-primary"
        aria-hidden="true"
      />
      <h1 className="text-2xl font-semibold">Рабочий лист не найден</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Он недоступен или уже удалён.
      </p>
      <Link
        href="/worksheets"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Мои рабочие листы
      </Link>
    </div>
  );
}
