import Link from "next/link";
import { Check } from "lucide-react";

const steps = [
  "Загрузка",
  "Ответы и баллы",
  "Распознавание",
  "Решения учителя",
];
const paths = ["", "/answers", "/process", "/review"];

export function GradingSteps({
  current,
  batchId,
}: {
  current: 0 | 1 | 2 | 3;
  batchId: string;
}) {
  return (
    <nav aria-label="Этапы проверки" className="studio-steps">
      <ol className="grid grid-cols-2 gap-x-5 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-7">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === current ? "step" : undefined}
            className={
              "flex min-w-0 items-center gap-2.5 text-xs " +
              (index === current
                ? "font-bold text-primary"
                : "text-muted-foreground")
            }
          >
            <span
              className={
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums " +
                (index === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border")
              }
            >
              {index < current ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            {index < current ? (
              <Link
                className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={"/grading/" + batchId + paths[index]}
              >
                {label}
              </Link>
            ) : (
              <span>{label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
