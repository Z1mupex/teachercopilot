"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { suggestDebateTopics } from "@/actions/debate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  debateTopicInputSchema,
  type DebateTopicInput,
  type DebateTopicOutput,
} from "@/lib/debate/ai-schema";

export function TopicSuggestions({
  available,
  onChoose,
}: {
  available: boolean;
  onChoose: (
    topic: string,
    language: "ru" | "en",
    support: DebateTopicOutput,
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{
    input: DebateTopicInput;
    output: DebateTopicOutput;
  }>();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DebateTopicInput>({
    resolver: zodResolver(debateTopicInputSchema),
    defaultValues: {
      subject: "Английский язык",
      level: "8 класс / A2–B1",
      theme: "Технологии и общество",
      language: "ru",
      includeEnglishSupport: true,
    },
  });
  return (
    <section
      className="rounded-2xl border bg-card p-5"
      aria-labelledby="debate-ai-title"
    >
      <h2
        id="debate-ai-title"
        className="flex items-center gap-2 text-lg font-semibold"
      >
        <Sparkles className="size-5 text-primary" aria-hidden />
        Темы от AI
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Необязательные предложения. Проверьте их перед уроком; выбранная тема
        попадёт в настройки.
      </p>
      {!available && (
        <p className="mt-3 text-sm">
          AI пока не подключён. Введите тему в настройках — арена работает без
          AI.
        </p>
      )}
      <form
        className="mt-4 space-y-4"
        onSubmit={handleSubmit((input) => {
          setError(undefined);
          setResult(undefined);
          startTransition(async () => {
            try {
              const response = await suggestDebateTopics(input);
              if ("error" in response) setError(response.error);
              else setResult({ input, output: response.suggestion });
            } catch {
              setError(
                "Не удалось выполнить запрос. Обновите страницу и попробуйте снова.",
              );
            }
          });
        })}
      >
        <fieldset
          disabled={pending || !available}
          className="grid gap-3 sm:grid-cols-2"
        >
          {(["subject", "level", "theme"] as const).map((field) => (
            <label
              key={field}
              className={field === "theme" ? "sm:col-span-2" : ""}
            >
              <span className="mb-1 block text-sm font-medium">
                {
                  {
                    subject: "Предмет",
                    level: "Класс / уровень",
                    theme: "Тема для AI",
                  }[field]
                }
              </span>
              <Input
                {...register(field)}
                aria-invalid={!!errors[field]}
                maxLength={
                  field === "theme" ? 300 : field === "level" ? 60 : 100
                }
              />
              {errors[field] && (
                <span className="mt-1 block text-sm text-destructive">
                  {errors[field].message}
                </span>
              )}
            </label>
          ))}
          <label>
            <span className="mb-1 block text-sm font-medium">Язык тем</span>
            <select
              {...register("language")}
              className="h-12 w-full rounded-xl border bg-card px-3"
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("includeEnglishSupport")}
              className="size-4 accent-primary"
            />
            Добавить лексику и фразы для English
          </label>
        </fieldset>
        <Button type="submit" disabled={pending || !available}>
          <Sparkles className="size-4" aria-hidden />
          {pending ? "Готовим темы…" : "Предложить 3 темы"}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {pending ? "Запрос выполняется. Таймер продолжает работать." : ""}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-primary">
            AI-предложения · выберите утверждение
          </p>
          <ol className="space-y-3">
            {result.output.statements.map((statement) => (
              <li key={statement} className="rounded-xl border p-4">
                <p lang={result.input.language}>{statement}</p>
                <Button
                  className="mt-3 bg-secondary text-foreground hover:bg-secondary/80"
                  onClick={() =>
                    onChoose(statement, result.input.language, result.output)
                  }
                >
                  Выбрать тему
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
