import Link from "next/link";
import { CircleCheck, CircleAlert, Minus, Sparkles } from "lucide-react";
import { AnalyticsAiSummary } from "@/components/grading/analytics-ai-summary";
import { Progress } from "@/components/ui/progress";
import type { AnswerState, GradingAnalytics } from "@/lib/grading/analytics";

const format = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(
        value,
      );
const states: Record<
  AnswerState,
  { label: string; className: string; symbol: string }
> = {
  correct: {
    label: "Верно",
    className:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    symbol: "✓",
  },
  partial: {
    label: "Частично",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    symbol: "◐",
  },
  wrong: {
    label: "Неверно",
    className: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
    symbol: "×",
  },
  not_graded: {
    label: "Не оценено",
    className: "bg-secondary text-foreground",
    symbol: "?",
  },
  not_applicable: {
    label: "Другой вариант",
    className: "text-muted-foreground",
    symbol: "—",
  },
};

export function BatchAnalytics({
  analytics,
  batchId,
  variant,
  page,
  aiAvailable,
}: {
  analytics: GradingAnalytics;
  batchId: string;
  variant?: string;
  page: number;
  aiAvailable: boolean;
}) {
  const summary = analytics.summary;
  const selectedId = variant === "base" ? null : variant;
  const questions = analytics.questions.filter(
    (q) => variant === undefined || q.variantId === selectedId,
  );
  const rows = analytics.rows.filter(
    (s) => variant === undefined || s.variantId === selectedId,
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pages);
  const pageRows = rows.slice((currentPage - 1) * 20, currentPage * 20);
  const variants = [
    ...new Map(
      analytics.questions.map((q) => [q.variantId, q.variantLabel]),
    ).entries(),
  ];
  const path = `/grading/${batchId}/results`;
  const link = (p: number, v = variant) =>
    `${path}?${new URLSearchParams({ ...(v === undefined ? {} : { variant: v }), page: String(p) })}`;
  return (
    <div className="min-w-0 space-y-6">
      <section aria-labelledby="batch-summary-title" className="space-y-4">
        <div>
          <h2 id="batch-summary-title" className="text-xl font-semibold">
            Что показала проверка
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Только итоговые оценки. Предложения AI не участвуют в расчётах.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Средний балл", value: format(summary.average) },
            { label: "Медиана", value: format(summary.median) },
            {
              label: "Минимум / максимум",
              value: `${format(summary.min)} / ${format(summary.max)}`,
            },
            {
              label: "Оценено работ",
              value: `${summary.completed} / ${summary.total}`,
            },
            {
              label: "Средний результат",
              value:
                summary.averagePercent === null
                  ? "—"
                  : `${format(summary.averagePercent)}%`,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">
          Баллы усредняются в исходной шкале. Для вариантов с разными
          максимумами сравнивайте процент результата. Если итог или оценка
          задания отсутствуют, работа не входит в сводку.
        </p>
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold">Распределение результатов</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            {summary.distribution.map((bin) => (
              <div key={bin.label}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{bin.label}</span>
                  <strong>{bin.count} работ</strong>
                </div>
                <Progress
                  aria-label={`Результат ${bin.label}: ${bin.count} работ`}
                  value={bin.count}
                  max={Math.max(summary.completed, 1)}
                  className="mt-2"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section
        aria-labelledby="weak-title"
        className="rounded-2xl border bg-card p-5 sm:p-6"
      >
        <h2
          id="weak-title"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <CircleAlert className="size-5 text-primary" aria-hidden="true" />
          Что повторить на следующем уроке
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Отмечены задания со средним результатом ниже 60% от максимума. Это
          ориентир для повторения. При выборке менее пяти работ вывод
          предварительный.
        </p>
        {analytics.weakQuestions.length ? (
          <>
            <ul className="mt-4 space-y-3">
              {analytics.weakQuestions.map((q) => (
                <li
                  key={q.id}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40"
                >
                  <p className="text-sm font-semibold">
                    {q.variantLabel} · Задание {q.number} ·{" "}
                    {format(q.averagePercent)}%
                  </p>
                  <p className="mt-2 break-words text-sm">{q.prompt}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Оценено: {q.graded}/{q.expected}. Решений учителя:{" "}
                    {q.interventionCount}.
                    {q.graded < 5 ? " Малая выборка." : ""}
                  </p>
                </li>
              ))}
            </ul>
            <Link
              href={`/worksheets/new?fromBatch=${batchId}`}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Создать работу по ошибкам
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Откроются заполненные параметры. Вы проверите их перед генерацией
              и сохранением.
            </p>
          </>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <CircleCheck className="size-5 text-primary" aria-hidden="true" />
            Заданий ниже порога нет. Проверьте распределение индивидуальных
            результатов.
          </p>
        )}
      </section>
      <section aria-labelledby="questions-title" className="space-y-4">
        <h2 id="questions-title" className="text-xl font-semibold">
          Результаты по заданиям
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Каждый вариант считается отдельно. Доли верных, частичных и неверных
          ответов рассчитаны от всех работ этого варианта. «Учитель» — число
          ответов, которые учитель подтвердил или изменил.
        </p>
        <div
          tabIndex={0}
          role="region"
          aria-label="Статистика заданий, таблица с горизонтальной прокруткой"
        className="relative max-w-full overflow-x-auto rounded-2xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full min-w-[780px] text-left text-sm">
            <caption className="sr-only">
              Средние баллы и доли результатов по каждому заданию
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="p-4">
                  Задание
                </th>
                <th scope="col" className="p-4">
                  Средний балл
                </th>
                <th scope="col" className="p-4">
                  Верно
                </th>
                <th scope="col" className="p-4">
                  Частично
                </th>
                <th scope="col" className="p-4">
                  Неверно
                </th>
                <th scope="col" className="p-4">
                  Не оценено
                </th>
                <th scope="col" className="p-4">
                  Учитель
                </th>
              </tr>
            </thead>
            <tbody>
              {analytics.questions.map((q) => (
                <tr
                  key={q.id}
                  className={`border-b last:border-0 ${q.weak ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
                >
                  <th scope="row" className="max-w-96 p-4 font-normal">
                    <span className="font-semibold">
                      {q.variantLabel} · № {q.number}
                      {q.weak ? " · Повторить" : ""}
                    </span>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {q.prompt}
                    </p>
                  </th>
                  <td className="p-4 tabular-nums">
                    {format(q.averagePoints)} / {format(q.maxScore)}
                    <p className="text-xs text-muted-foreground">
                      {q.graded}/{q.expected} оценено
                    </p>
                  </td>
                  {[q.correctPercent, q.partialPercent, q.wrongPercent].map(
                    (value, i) => (
                      <td key={i} className="p-4 tabular-nums">
                        {value === null ? "—" : `${format(value)}%`}
                      </td>
                    ),
                  )}
                  <td className="p-4">{q.expected - q.graded}</td>
                  <td className="p-4">{q.interventionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="heatmap-title" className="space-y-4">
        <h2 id="heatmap-title" className="text-xl font-semibold">
          Карта ошибок
        </h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.values(states).map((s) => (
            <span
              key={s.label}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${s.className}`}
            >
              <span aria-hidden="true">{s.symbol}</span>
              {s.label}
            </span>
          ))}
        </div>
        {variants.length > 1 && (
          <nav
            aria-label="Вариант карты ошибок"
            className="flex flex-wrap gap-2"
          >
            {[
              ["all", "Все варианты"],
              ...variants.map(([id, label]) => [id ?? "base", label]),
            ].map(([id, label]) => (
              <Link
                key={id}
                aria-current={
                  (id === "all" ? variant === undefined : variant === id)
                    ? "page"
                    : undefined
                }
                href={id === "all" ? path : link(1, id)}
                className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <div
          tabIndex={0}
          role="region"
          aria-label="Карта ошибок, таблица с горизонтальной прокруткой"
        className="relative max-w-full overflow-x-auto rounded-2xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full text-center text-xs">
            <caption className="sr-only">
              Строки — работы, столбцы — задания. Символ и балл дублируют цвет.
            </caption>
            <thead>
              <tr className="border-b">
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-40 bg-card p-3 text-left"
                >
                  Работа
                </th>
                {questions.map((q) => (
                  <th
                    key={q.id}
                    scope="col"
                    title={q.prompt}
                    className="min-w-24 p-3"
                  >
                    <span className="block">{q.variantLabel}</span>
                    <span>№ {q.number}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-56 bg-card p-3 text-left font-normal"
                  >
                    <span className="block font-semibold">№ {s.number}</span>
                    <span className="block break-words text-muted-foreground">
                      {s.studentName ?? `Работа № ${s.number}`}
                    </span>
                  </th>
                  {questions.map((q) => {
                    const cell = s.cells.find((c) => c.questionId === q.id)!;
                    const state = states[cell.state];
                    const label = `${q.variantLabel}, задание ${q.number}: ${state.label}${cell.state === "not_applicable" ? "" : `, ${format(cell.score)} из ${format(cell.maxScore)}`}`;
                    return (
                      <td
                        key={q.id}
                        title={label}
                        aria-label={label}
                        className="p-2"
                      >
                        <span
                          className={`inline-flex min-h-11 min-w-16 items-center justify-center gap-1 rounded-lg px-2 font-medium tabular-nums ${state.className}`}
                        >
                          <span aria-hidden="true">{state.symbol}</span>
                          {cell.state !== "not_applicable" ? (
                            format(cell.score)
                          ) : (
                            <Minus className="size-3" aria-hidden="true" />
                          )}
                          <span className="sr-only">{state.label}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!pageRows.length && (
          <p className="text-sm text-muted-foreground">
            Нет работ выбранного варианта.
          </p>
        )}
        <nav
          aria-label="Страницы карты ошибок"
          className="flex flex-wrap items-center gap-3 text-sm"
        >
          <span>
            Страница {currentPage} из {pages} · {rows.length} работ
          </span>
          {currentPage > 1 && (
            <Link
              className="inline-flex min-h-11 items-center rounded-xl border px-4"
              href={link(currentPage - 1)}
            >
              Предыдущая
            </Link>
          )}
          {currentPage < pages && (
            <Link
              className="inline-flex min-h-11 items-center rounded-xl border px-4"
              href={link(currentPage + 1)}
            >
              Следующая
            </Link>
          )}
        </nav>
      </section>
      <AnalyticsAiSummary batchId={batchId} available={aiAvailable} />
    </div>
  );
}
