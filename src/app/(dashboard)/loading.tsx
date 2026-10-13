export default function Loading() {
  return (
    <div role="status" className="animate-pulse space-y-6">
      <span className="sr-only">Загрузка страницы…</span>
      <div className="h-10 w-2/3 rounded-xl bg-secondary" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-36 rounded-2xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}
