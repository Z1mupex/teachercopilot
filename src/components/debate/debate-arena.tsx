"use client";
import { useEffect, useReducer, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  BookOpen,
  Dices,
  Minus,
  Pause,
  Play,
  Plus,
  Projector,
  RotateCcw,
  Settings2,
  Shuffle,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TopicSuggestions } from "@/components/debate/topic-suggestions";
import {
  createDebate,
  debateReducer,
  debateSetupSchema,
  defaultSetup,
  hasDebateProgress,
  phaseDuration,
  phaseLabels,
  timerText,
  type DebateSetup,
} from "@/lib/debate/domain";
import {
  debateEvents,
  englishSupport,
  type DebateEvent,
} from "@/lib/debate/events";
import type { DebateTopicOutput } from "@/lib/debate/ai-schema";
import { cn } from "@/lib/utils";

const secondary = "bg-secondary text-foreground hover:bg-secondary/80";
const textarea =
  "w-full rounded-xl border bg-card p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";
const eventTones = {
  orange:
    "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30",
  violet:
    "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30",
  blue: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30",
  green:
    "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
};
export function DebateArena({ aiAvailable }: { aiAvailable: boolean }) {
  const [state, dispatch] = useReducer(
    debateReducer,
    defaultSetup,
    createDebate,
  );
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [projecting, setProjecting] = useState(false);
  const [event, setEvent] = useState<DebateEvent>();
  const [pendingSetup, setPendingSetup] = useState<DebateSetup>();
  const [notice, setNotice] = useState("");
  const [candidateSupport, setCandidateSupport] = useState<{
    topic: string;
    data: DebateTopicOutput;
  }>();
  const [support, setSupport] = useState(englishSupport);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DebateSetup>({
    resolver: zodResolver(debateSetupSchema),
    defaultValues: defaultSetup,
  });
  useEffect(() => {
    if (!state.running) return;
    const tick = () => dispatch({ type: "tick", now: performance.now() });
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [state.running]);
  const applySetup = (setup: DebateSetup) => {
    dispatch({ type: "configure", setup });
    setPendingSetup(undefined);
    setSettingsOpen(false);
    setEvent(undefined);
    setSupport(
      setup.language === "en" &&
        candidateSupport?.topic === setup.topic &&
        candidateSupport.data.vocabulary.length
        ? candidateSupport.data
        : englishSupport,
    );
    setNotice("Настройки применены. Начните подготовку команд.");
  };
  const duration = phaseDuration(state.setup, state.phase);
  const fraction = duration ? state.remainingMs / duration : 0;
  const ended = state.phase === "finished";
  const expired = !ended && state.remainingMs <= 0;
  return (
    <div
      className={cn(
        "min-w-0 space-y-5",
        projecting && "rounded-3xl border bg-background p-4 sm:p-8",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">
            Обсуждать · аргументировать · слушать
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Debate Arena
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Состояние хранится в этой вкладке. При обновлении страницы дебаты
            сбросятся.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className={secondary}
            aria-pressed={projecting}
            onClick={() => setProjecting(!projecting)}
          >
            <Projector className="size-4" aria-hidden />
            {projecting ? "Обычный вид" : "Режим проектора"}
          </Button>
          {!projecting && (
            <Button
              className={secondary}
              aria-expanded={settingsOpen}
              aria-controls="debate-settings"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings2 className="size-4" aria-hidden />
              Настройки
            </Button>
          )}
        </div>
      </header>
      {!projecting && settingsOpen && (
        <section
          id="debate-settings"
          className="rounded-2xl border bg-card p-5"
          aria-labelledby="debate-settings-title"
        >
          <h2 id="debate-settings-title" className="text-lg font-semibold">
            Подготовьте дебаты
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Каждый раунд: подготовка → FOR → AGAINST. Таймер останавливается на
            нуле; следующий этап запускает учитель.
          </p>
          <form
            className="mt-4 space-y-4"
            onSubmit={handleSubmit((setup) =>
              hasDebateProgress(state)
                ? setPendingSetup(setup)
                : applySetup(setup),
            )}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                Утверждение для дебатов
              </span>
              <textarea
                rows={2}
                maxLength={500}
                {...register("topic")}
                aria-invalid={!!errors.topic}
                className={textarea}
              />
              {errors.topic && (
                <span className="text-sm text-destructive">
                  {errors.topic.message}
                </span>
              )}
            </label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label>
                <span className="mb-1 block text-sm font-medium">
                  Язык дебатов
                </span>
                <select
                  {...register("language")}
                  className="h-12 w-full rounded-xl border bg-card px-3"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </label>
              {(
                ["rounds", "preparationSeconds", "speakingSeconds"] as const
              ).map((field) => (
                <label key={field}>
                  <span className="mb-1 block text-sm font-medium">
                    {
                      {
                        rounds: "Количество раундов",
                        preparationSeconds: "Подготовка, секунд",
                        speakingSeconds: "Выступление, секунд",
                      }[field]
                    }
                  </span>
                  <Input
                    type="number"
                    min={field === "rounds" ? 1 : 5}
                    max={field === "rounds" ? 12 : 3600}
                    step={1}
                    {...register(field, { valueAsNumber: true })}
                    aria-invalid={!!errors[field]}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {errors[field]
                      ? errors[field].message
                      : field === "rounds"
                        ? "От 1 до 12"
                        : "От 5 до 3600 · 60 секунд = 1 минута"}
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([0, 1] as const).map((team) => (
                <fieldset
                  key={team}
                  className="space-y-3 rounded-xl border p-4"
                >
                  <legend className="px-1 text-sm font-semibold">
                    Команда {team + 1} · начальная сторона{" "}
                    {team === 0 ? "FOR" : "AGAINST"}
                  </legend>
                  <label className="block">
                    <span className="mb-1 block text-sm">
                      Название команды {team + 1}
                    </span>
                    <Input
                      maxLength={60}
                      {...register(`teams.${team}.name`)}
                      aria-invalid={!!errors.teams?.[team]?.name}
                    />
                    {errors.teams?.[team]?.name && (
                      <span className="text-sm text-destructive">
                        {errors.teams[team].name.message}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm">
                      Участники команды {team + 1} · необязательно
                    </span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      {...register(`teams.${team}.participants`)}
                      className={textarea}
                      placeholder="Одно имя на строку"
                      aria-invalid={!!errors.teams?.[team]?.participants}
                    />
                    {errors.teams?.[team]?.participants && (
                      <span className="text-sm text-destructive">
                        {errors.teams[team].participants.message}
                      </span>
                    )}
                  </label>
                </fieldset>
              ))}
            </div>
            <Button type="submit">Применить настройки</Button>
          </form>
          {pendingSetup && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <p>
                Применение настроек начнёт новые дебаты: таймер, раунды, стороны
                и счёт сбросятся.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => applySetup(pendingSetup)}>
                  Сбросить и применить
                </Button>
                <Button
                  className={secondary}
                  onClick={() => setPendingSetup(undefined)}
                >
                  Продолжить текущие дебаты
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
      <section
        aria-labelledby="debate-topic-title"
        className="rounded-2xl border bg-card px-5 py-4"
      >
        <h2
          id="debate-topic-title"
          className="text-sm font-medium text-muted-foreground"
        >
          Тема дебатов · {state.setup.language === "en" ? "English" : "Русский"}
        </h2>
        <p
          lang={state.setup.language}
          className={cn(
            "mt-2 break-words text-xl font-semibold sm:text-2xl",
            projecting && "sm:text-3xl",
          )}
        >
          {state.setup.topic}
        </p>
      </section>
      <section
        aria-label="Арена дебатов"
        className="rounded-2xl border bg-card p-4 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold">
            Раунд {state.round} / {state.setup.rounds}
          </p>
          <p role="status" className="text-sm font-medium">
            {ended
              ? "Дебаты завершены"
              : expired
                ? "Время этапа истекло"
                : state.running
                  ? "Таймер идёт"
                  : "Таймер на паузе"}
          </p>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.1fr_1fr]">
          {([0, 1] as const).map((side) => {
            const team = state.sides[side];
            const data = state.setup.teams[team];
            const active = state.phase === (side === 0 ? "for" : "against");
            return (
              <section
                key={side}
                aria-label={`${side === 0 ? "FOR" : "AGAINST"}: ${data.name}`}
                className={cn(
                  "min-w-0 rounded-2xl border p-5",
                  side === 0
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                    : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30",
                  active && "ring-2 ring-primary",
                  side === 1 && "lg:col-start-3 lg:row-start-1",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      className={cn(
                        "flex items-center gap-2 text-2xl font-bold",
                        projecting && "text-3xl",
                      )}
                    >
                      <Trophy className="size-6" aria-hidden />
                      {side === 0 ? "FOR" : "AGAINST"}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {side === 0
                        ? "Согласны с утверждением"
                        : "Не согласны с утверждением"}
                    </p>
                  </div>
                  <output
                    aria-label={`Счёт команды ${data.name}`}
                    className="text-4xl font-bold tabular-nums"
                  >
                    {state.scores[team]}
                  </output>
                </div>
                <p className="mt-4 break-words text-lg font-semibold">
                  {data.name}
                </p>
                <ul className="mt-3 space-y-2">
                  {data.participants
                    .split("\n")
                    .map((name) => name.trim())
                    .filter(Boolean)
                    .map((name, index) => (
                      <li
                        key={index}
                        className="break-words rounded-xl bg-background/70 px-3 py-2 text-sm"
                      >
                        {name}
                      </li>
                    ))}
                </ul>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    className={cn(secondary, "px-3")}
                    disabled={state.scores[team] === 0}
                    aria-label={`Убавить балл: ${data.name}`}
                    onClick={() => dispatch({ type: "score", team, delta: -1 })}
                  >
                    <Minus className="size-4" aria-hidden />
                  </Button>
                  <Button
                    className={cn(secondary, "px-3")}
                    disabled={state.scores[team] === 999}
                    aria-label={`Добавить балл: ${data.name}`}
                    onClick={() => dispatch({ type: "score", team, delta: 1 })}
                  >
                    <Plus className="size-4" aria-hidden />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Решение учителя
                  </span>
                </div>
              </section>
            );
          })}
          <div className="order-first flex flex-col items-center justify-center self-center py-2 text-center lg:order-none lg:col-start-2 lg:row-start-1">
            <div className="relative flex aspect-square w-full max-w-64 items-center justify-center">
              <svg
                viewBox="0 0 200 200"
                className="absolute inset-0 size-full -rotate-90"
                aria-hidden
              >
                <circle
                  cx="100"
                  cy="100"
                  r="91"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  className="text-secondary"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="91"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 91}
                  strokeDashoffset={(1 - fraction) * 2 * Math.PI * 91}
                  className={expired ? "text-destructive" : "text-primary"}
                />
              </svg>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {ended ? "Финиш" : "Осталось"}
                </p>
                <p
                  role="timer"
                  aria-label="Оставшееся время"
                  aria-live="off"
                  className={cn(
                    "mt-2 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl",
                    expired && "text-destructive",
                    projecting && "sm:text-7xl",
                  )}
                >
                  {timerText(state.remainingMs)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-lg font-semibold">
              {phaseLabels[state.phase]}
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {ended
                ? "Обсудите аргументы и подведите итоги."
                : "Переход к следующему этапу — вручную."}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            disabled={ended || expired}
            onClick={() =>
              dispatch({
                type: state.running ? "pause" : "start",
                now: performance.now(),
              })
            }
          >
            {state.running ? (
              <Pause className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {state.running ? "Пауза" : "Старт"}
          </Button>
          <Button
            className={secondary}
            disabled={ended}
            onClick={() => dispatch({ type: "reset" })}
          >
            <RotateCcw className="size-4" aria-hidden />
            Сбросить этап
          </Button>
          <Button
            className={secondary}
            disabled={ended}
            onClick={() => dispatch({ type: "next_phase" })}
          >
            <ArrowRight className="size-4" aria-hidden />
            {state.phase === "against" && state.round === state.setup.rounds
              ? "Завершить дебаты"
              : "Следующий этап"}
          </Button>
          <Button
            className={secondary}
            disabled={ended || state.round === state.setup.rounds}
            onClick={() => dispatch({ type: "next_round" })}
          >
            Следующий раунд
          </Button>
          <Button
            className={secondary}
            onClick={() => {
              dispatch({ type: "switch", now: performance.now() });
              setNotice(
                "Стороны поменялись. Счёт и участники остались у своих команд; таймер на паузе.",
              );
            }}
          >
            <Shuffle className="size-4" aria-hidden />
            Поменять стороны
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          «Сбросить этап» сохраняет счёт. «Следующий раунд» пропускает
          оставшиеся выступления текущего раунда.
        </p>
      </section>
      <p role="status" className="text-sm text-muted-foreground">
        {notice}
      </p>
      <section
        aria-labelledby="debate-events-title"
        className="rounded-2xl border bg-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="debate-events-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Dices className="size-5 text-primary" aria-hidden />
            События для дебатов
          </h2>
          <Button
            className={secondary}
            onClick={() => {
              const values = new Uint32Array(1);
              crypto.getRandomValues(values);
              setEvent(debateEvents[values[0] % debateEvents.length]);
            }}
          >
            Случайное событие
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {debateEvents.map((card) => (
            <button
              type="button"
              key={card.id}
              aria-pressed={event?.id === card.id}
              onClick={() => setEvent(card)}
              className={cn(
                "rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                eventTones[card.tone],
                event?.id === card.id && "ring-2 ring-primary",
              )}
            >
              <span className="text-sm font-bold">{card.id}</span>
              <span className="mt-1 block text-sm">{card.title}</span>
            </button>
          ))}
        </div>
        {event && (
          <div
            role="status"
            className={cn("mt-4 rounded-xl border p-4", eventTones[event.tone])}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">
                {event.id} · {event.title}
              </h3>
              <Button
                className={cn(secondary, "px-3")}
                aria-label="Убрать событие"
                onClick={() => setEvent(undefined)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <p className="mt-2 text-base">{event.description}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Карточка не меняет таймер, стороны или счёт автоматически.
            </p>
          </div>
        )}
      </section>
      {!projecting && (
        <div className="grid gap-5 xl:grid-cols-2">
          <TopicSuggestions
            available={aiAvailable}
            onChoose={(topic, language, data) => {
              setValue("topic", topic, { shouldValidate: true });
              setValue("language", language);
              setCandidateSupport({ topic, data });
              setSettingsOpen(true);
              setNotice(
                "AI-тема выбрана. Проверьте и примените настройки перед началом дебатов.",
              );
            }}
          />
          {state.setup.language === "en" && (
            <section
              aria-labelledby="debate-phrases-title"
              className="rounded-2xl border bg-card p-5"
            >
              <h2
                id="debate-phrases-title"
                className="flex items-center gap-2 text-lg font-semibold"
              >
                <BookOpen className="size-5 text-primary" aria-hidden />
                Полезные слова и фразы
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {support === englishSupport
                  ? "Базовые фразы для English."
                  : "AI-предложения к выбранной теме. Проверьте перед уроком."}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    "vocabulary",
                    "agreeing",
                    "disagreeing",
                    "transitions",
                  ] as const
                ).map((category) => (
                  <section key={category}>
                    <h3 className="font-semibold">
                      {
                        {
                          vocabulary: "Лексика",
                          agreeing: "Согласие",
                          disagreeing: "Несогласие",
                          transitions: "Переходы",
                        }[category]
                      }
                    </h3>
                    <ul lang="en" className="mt-2 space-y-2 text-sm">
                      {support[category].map((phrase, index) => (
                        <li
                          key={index}
                          className="break-words rounded-xl bg-secondary p-3"
                        >
                          {phrase}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
