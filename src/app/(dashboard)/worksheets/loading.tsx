export default function WorksheetsLoading() {
  return (
    <div
      role="status"
      aria-label="Загрузка рабочих листов"
      className="space-y-6"
    >
      <p className="text-sm text-muted-foreground">Загружаем рабочие листы…</p>
      <div className="h-10 w-56 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-56 animate-pulse rounded-2xl border bg-muted"
          />
        ))}
      </div>
    </div>
  );
}
