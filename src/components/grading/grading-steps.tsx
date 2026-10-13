import Link from "next/link";
import { Check } from "lucide-react";

const steps = [
  "Загрузить работы",
  "Добавить ответы",
  "Распознать и оценить",
  "Проверить результаты",
];

export function GradingSteps({
  current,
  batchId,
}: {
  current: 0 | 1 | 2 | 3;
  batchId: string;
}) {
  return (
    <nav aria-label="Этапы проверки">
      <ol className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === current ? "step" : undefined}
            className={`flex min-w-0 flex-col items-start gap-2 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:gap-3 ${index === current ? "border-primary/30 bg-primary/10 font-medium text-primary" : "bg-card text-muted-foreground"}`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full ${index === current ? "bg-primary text-primary-foreground" : "border bg-background"}`}
            >
              {index < current ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {index < current ? (
                <Link
                  className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={`/grading/${batchId}${["", "/answers", "/process", "/review"][index]}`}
                >
                  {label}
                </Link>
              ) : (
                label
              )}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
