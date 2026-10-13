import Link from "next/link";

export default function ClassNotFound() {
  return (
    <div className="rounded-2xl border bg-card px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold">Класс не найден</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Возможно, он удалён или недоступен вашему аккаунту.
      </p>
      <Link
        href="/classes"
        className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        К списку классов
      </Link>
    </div>
  );
}
