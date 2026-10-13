"use client";

import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import type { TeacherSettings } from "@/lib/settings/schema";

export function ScaleEditor({
  value,
  onChange,
  maximum,
  label,
}: {
  value: TeacherSettings["fo_scale"];
  onChange: (value: TeacherSettings["fo_scale"]) => void;
  maximum: number;
  label: string;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="border-b bg-secondary/50">
            <tr>
              <th className="px-3 py-2 font-medium">От, %</th>
              <th className="px-3 py-2 font-medium">Оценка</th>
              <th>
                <span className="sr-only">Удалить порог</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {value.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="p-2">
                  <Input
                    aria-label={`${label}: процент ${index + 1}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Number.isFinite(row.percent) ? row.percent : ""}
                    onChange={(e) =>
                      onChange(
                        value.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                percent:
                                  e.target.value === ""
                                    ? Number.NaN
                                    : Number(e.target.value),
                              }
                            : r,
                        ),
                      )
                    }
                    className="h-10 min-h-10 w-24"
                  />
                </td>
                <td className="p-2">
                  <Input
                    aria-label={`${label}: оценка ${index + 1}`}
                    type="number"
                    min={0}
                    max={maximum}
                    step={1}
                    value={Number.isFinite(row.grade) ? row.grade : ""}
                    onChange={(e) =>
                      onChange(
                        value.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                grade:
                                  e.target.value === ""
                                    ? Number.NaN
                                    : Number(e.target.value),
                              }
                            : r,
                        ),
                      )
                    }
                    className="h-10 min-h-10 w-20"
                  />
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    aria-label={`${label}: удалить порог ${index + 1}`}
                    disabled={value.length <= 2}
                    onClick={() =>
                      onChange(value.filter((_, i) => i !== index))
                    }
                    className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={value.length >= 11}
        onClick={() =>
          onChange([
            ...value,
            {
              percent: Math.min(100, (value.at(-1)?.percent ?? 0) + 5),
              grade: Math.min(maximum, (value.at(-1)?.grade ?? 0) + 1),
            },
          ])
        }
        className="inline-flex min-h-11 items-center gap-2 text-sm text-primary disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
        Добавить порог
      </button>
    </div>
  );
}
