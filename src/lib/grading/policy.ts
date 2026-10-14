// Shared by grading services and presentation; components never infer confidence.
export const GRADING_POLICY = {
  highConfidence: 0.95,
  mediumConfidence: 0.75,
  concurrency: 2,
  leaseSeconds: 180,
  maxKeyCharacters: 28_000,
} as const;

export const gradingFlagLabels = {
  blank: "Ответ отсутствует",
  unreadable: "Не удалось прочитать",
  ambiguous: "Неоднозначное распознавание",
  low_confidence: "Низкая уверенность",
  ai_judgment: "Оценка требует суждения",
  unsupported_number: "Не удалось сопоставить число",
  conflicting_choices: "Несогласованные варианты ответа",
  comparison_mismatch: "Нужна проверка по правилам сравнения",
  missing_criteria: "Нет подтверждённых критериев",
  open_response: "Развёрнутый ответ",
  missing: "Модель не нашла ответ",
} as const;

export type GradingFlag = keyof typeof gradingFlagLabels;

export function confidenceLabel(confidence: number) {
  return confidence >= GRADING_POLICY.highConfidence
    ? "Высокая"
    : confidence >= GRADING_POLICY.mediumConfidence
      ? "Средняя"
      : "Низкая";
}
