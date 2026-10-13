import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  FilePlus2,
  Heart,
  MessagesSquare,
  Sparkles,
} from "lucide-react";

import { DashboardOverview } from "@/components/dashboard/overview";
import { getTeacherSettings } from "@/lib/settings/repository";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/queries";

const quickActions = [
  {
    href: "/grading",
    title: "Проверить готовую работу",
    text: "Работы учеников и проверка по вашим критериям",
    icon: ClipboardCheck,
    color:
      "border-blue-100 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/40",
    iconColor: "bg-blue-100 text-primary dark:bg-blue-900/50",
  },
  {
    href: "/worksheets/new",
    title: "Создать worksheet",
    text: "Рабочие листы по теме вашего урока",
    icon: FilePlus2,
    color:
      "border-emerald-100 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30",
    iconColor:
      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  {
    href: "/debate",
    title: "Debate Arena",
    text: "Дебаты для живого обсуждения на уроке",
    icon: MessagesSquare,
    color:
      "border-violet-100 bg-violet-50/80 dark:border-violet-900 dark:bg-violet-950/30",
    iconColor:
      "bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300",
  },
];

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const { settings } = await getTeacherSettings(user.id);
  const name = settings.full_name;
  const data = await getDashboardData(user.id);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-full flex-1">
          <p className="mb-2 text-sm font-medium text-primary">
            Ваш день начинается здесь
          </p>
          <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">
            Добрый день, {name}!
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            Инструменты для повседневной работы, чтобы оставалось больше времени
            на учеников{" "}
            <Heart
              className="inline size-4 fill-blue-400 text-blue-400"
              aria-hidden="true"
            />
          </p>
        </div>
        <div className="flex max-w-xs gap-3 rounded-2xl bg-gradient-to-br from-amber-50 to-blue-50 p-4 text-sm leading-6 text-muted-foreground dark:from-amber-950/30 dark:to-blue-950/40">
          <Sparkles
            className="mt-1 size-5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          Маленькие шаги сегодня — больше времени для важных целей завтра.
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {quickActions.map(
          ({ href, title, text, icon: Icon, color, iconColor }) => (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-4 rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${color}`}
            >
              <span
                className={`flex size-14 shrink-0 items-center justify-center rounded-full ${iconColor}`}
              >
                <Icon className="size-7" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block text-base font-semibold">{title}</span>
                <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                  {text}
                </span>
              </span>
              <ArrowRight
                className="size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
            </Link>
          ),
        )}
      </div>
      <DashboardOverview data={data} />
    </div>
  );
}
