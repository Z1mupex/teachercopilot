import { duplicateQuestion } from "@/lib/worksheets/domain";
import type { WorksheetInput } from "@/types/worksheets";

export function worksheetVariants(worksheet: WorksheetInput) {
  return [
    { id: null, label: "Вариант 1", questions: worksheet.questions },
    ...(worksheet.variants ?? []),
  ];
}

export function resizeWorksheetVariants(
  worksheet: WorksheetInput,
  count: number,
): WorksheetInput {
  if (!Number.isInteger(count) || count < 1 || count > 10)
    throw new Error("Выберите от 1 до 10 вариантов.");
  const variants = structuredClone(worksheet.variants ?? []).slice(
    0,
    count - 1,
  );
  while (variants.length < count - 1) {
    let label = `Вариант ${variants.length + 2}`;
    const used = new Set([
      "вариант 1",
      ...variants.map((variant) =>
        variant.label.trim().toLocaleLowerCase("ru-RU"),
      ),
    ]);
    while (used.has(label.toLocaleLowerCase("ru-RU"))) label += " (копия)";
    variants.push({
      id: crypto.randomUUID(),
      label,
      questions: worksheet.questions.map(duplicateQuestion),
    });
  }
  if (
    worksheet.questions.length +
      variants.reduce((sum, variant) => sum + variant.questions.length, 0) >
    300
  )
    throw new Error("Во всех вариантах допускается не более 300 заданий.");
  return { ...worksheet, variants };
}
