import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  Plus,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { getDashboardData } from "@/lib/dashboard/queries";

const batchLabels = new Map([
  ["draft", "Черновик"],
  ["uploading", "Загрузка"],
  ["ready", "Готово к добавлению ответов"],
  ["processing", "Проверяется"],
  ["review", "На проверке учителя"],
  ["completed", "Завершено"],
  ["failed", "Ошибка"],
]);
const worksheetLabels = new Map([
  ["draft", "Черновик"],
  ["ready", "Готово"],
  ["archived", "В архиве"],
]);
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
});
type OverviewData = Awaited<ReturnType<typeof getDashboardData>>;

function EmptyState({ text }: { text: string }) {
  return (
    <p className="flex min-h-36 items-center justify-center rounded-xl border border-dashed bg-background/50 p-5 text-center text-sm leading-6 text-muted-foreground">
      {text}
    </p>
  );
}

export function DashboardOverview({ data }: { data: OverviewData }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Классов", count: data.classCount, icon: Users },
          {
            label: "Рабочих листов",
            count: data.worksheetCount,
            icon: BookOpen,
          },
          { label: "Проверок", count: data.batchCount, icon: ClipboardCheck },
        ].map(({ label, count, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-2xl border bg-card p-5"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums">{count}</p>
              <p className="mt-1 text-sm text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Card className="h-full shadow-none">
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>Мои классы</CardTitle>
            <Link
              href="/classes"
              className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Все классы
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.classes.length === 0 ? (
              <div className="space-y-4">
                <EmptyState text="Добавьте первый класс, чтобы начать организовывать работу с учебными группами." />
                <Link
                  href="/classes/new"
                  className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Добавить класс
                </Link>
              </div>
            ) : (
              <ul className="divide-y">
                {data.classes.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/classes/${item.id}`}
                      className="flex items-center gap-3 rounded-lg py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                        <Users className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {item.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.student_count === null
                            ? "Количество учеников не указано"
                            : `Учеников: ${item.student_count}`}
                          {item.subject ? ` · ${item.subject}` : ""}
                        </p>
                      </div>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="h-full shadow-none">
          <CardHeader>
            <CardTitle>Недавние проверки</CardTitle>
            <p className="text-xs text-muted-foreground">
              Последние загруженные работы
            </p>
          </CardHeader>
          <CardContent>
            {data.batches.length === 0 ? (
              <EmptyState text="Пока нет проверок. Здесь появятся результаты после загрузки и проверки работ." />
            ) : (
              <ul className="divide-y">
                {data.batches.map((item) => (
                  <li key={item.id} className="flex gap-3 py-4">
                    <ClipboardCheck
                      className="mt-1 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/grading/${item.id}`}
                        className="break-words text-sm font-semibold hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {batchLabels.get(item.status) ?? item.status}
                        </span>
                        <span>
                          {item.processed_submissions}/{item.total_submissions}{" "}
                          работ
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {dateFormatter.format(new Date(item.created_at))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="h-full shadow-none">
          <CardHeader className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <CardTitle>Недавние рабочие листы</CardTitle>
              <p className="text-xs text-muted-foreground">
                Ваши учебные материалы
              </p>
            </div>
            <Link
              href="/worksheets"
              className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Все листы
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.worksheets.length === 0 ? (
              <div className="space-y-4">
                <EmptyState text="Пока нет рабочих листов. Сохранённые задания будут появляться здесь." />
                <Link
                  href="/worksheets/new"
                  className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Создать рабочий лист
                </Link>
              </div>
            ) : (
              <ul className="divide-y">
                {data.worksheets.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/worksheets/${item.id}`}
                      className="flex gap-3 rounded-lg py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FileText
                        className="mt-1 size-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">
                          {item.title}
                        </p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {[
                            item.subject,
                            item.grade === null ? null : `${item.grade} класс`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Предмет и параллель не указаны"}
                        </p>
                        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {worksheetLabels.get(item.status) ?? item.status}
                          </span>
                          <span>
                            {dateFormatter.format(new Date(item.created_at))}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
