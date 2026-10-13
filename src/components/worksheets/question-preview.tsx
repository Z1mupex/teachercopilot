import type { QuestionInput } from "@/types/worksheets";
import { difficultyLabels, questionTypeLabels } from "./labels";

export function QuestionPreview({
  question,
  index,
  showAnswer = true,
}: {
  question: QuestionInput;
  index: number;
  showAnswer?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-primary">
          Задание {index + 1} · {questionTypeLabels[question.type]}
        </span>
        <span className="rounded-lg bg-secondary px-2.5 py-1 text-muted-foreground">
          {question.max_score} балл(ов)
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">
        {question.prompt || "Формулировка ещё не заполнена"}
      </p>
      {question.type === "multiple_choice" && (
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {question.options.map((option, optionIndex) => (
            <li key={option.id} className="flex min-w-0 gap-2">
              <span className="font-medium text-muted-foreground">
                {String.fromCharCode(А_CHAR_CODE + optionIndex)})
              </span>
              <span className="min-w-0 flex-1 break-words">
                {option.text || "Пустой вариант"}
              </span>
            </li>
          ))}
        </ol>
      )}
      {question.type !== "multiple_choice" && (
        <div className="mt-4 h-7 border-b border-dashed" aria-hidden="true" />
      )}
      {showAnswer && (
        <div className="mt-4 space-y-2 rounded-lg bg-secondary/60 p-3 text-xs leading-5">
          <p className="font-medium text-muted-foreground">Ключ для учителя</p>
          <p className="whitespace-pre-wrap break-words">
            {question.type === "multiple_choice"
              ? question.options
                  .filter((option) =>
                    question.correct_option_ids.includes(option.id),
                  )
                  .map((option) => option.text || "Пустой вариант")
                  .join("; ") || "Правильные варианты не выбраны"
              : question.type === "numeric"
                ? `${question.expected_answer} (допуск: ${question.tolerance})`
                : question.expected_answer || "Ответ не указан"}
          </p>
          {question.type === "open_response" && question.rubric && (
            <p className="whitespace-pre-wrap break-words">
              Критерии: {question.rubric}
            </p>
          )}
        </div>
      )}
      {question.difficulty && (
        <p className="mt-3 text-xs text-muted-foreground">
          Сложность: {difficultyLabels[question.difficulty]}
        </p>
      )}
    </article>
  );
}

const А_CHAR_CODE = 1040;
