import { z } from "zod";

const teamSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Назовите команду.")
      .max(60, "Название — до 60 символов."),
    participants: z
      .string()
      .max(2000, "Список участников — до 2000 символов.")
      .refine(
        (value) =>
          value.split("\n").filter((name) => name.trim()).length <= 30 &&
          value.split("\n").every((name) => name.trim().length <= 60),
        "До 30 участников, каждое имя до 60 символов.",
      ),
  })
  .strict();
export const debateSetupSchema = z
  .object({
    topic: z
      .string()
      .trim()
      .min(3, "Введите утверждение для дебатов.")
      .max(500, "Утверждение — до 500 символов."),
    language: z.enum(["ru", "en"]),
    rounds: z
      .number({ error: "Укажите количество раундов." })
      .int("Укажите целое число.")
      .min(1, "Минимум один раунд.")
      .max(12, "Максимум 12 раундов."),
    preparationSeconds: z
      .number({ error: "Укажите время подготовки." })
      .int("Укажите целое число секунд.")
      .min(5, "Минимум 5 секунд.")
      .max(3600, "Максимум 3600 секунд."),
    speakingSeconds: z
      .number({ error: "Укажите время выступления." })
      .int("Укажите целое число секунд.")
      .min(5, "Минимум 5 секунд.")
      .max(3600, "Максимум 3600 секунд."),
    teams: z.tuple([teamSchema, teamSchema]),
  })
  .strict();
export type DebateSetup = z.infer<typeof debateSetupSchema>;
export const defaultSetup: DebateSetup = {
  topic: "Социальные сети приносят подросткам больше вреда, чем пользы.",
  language: "ru",
  rounds: 4,
  preparationSeconds: 120,
  speakingSeconds: 90,
  teams: [
    { name: "Команда 1", participants: "" },
    { name: "Команда 2", participants: "" },
  ],
};
export type Phase = "preparation" | "for" | "against" | "finished";
export const phaseLabels: Record<Phase, string> = {
  preparation: "Подготовка обеих команд",
  for: "Выступление FOR",
  against: "Выступление AGAINST",
  finished: "Дебаты завершены",
};
export type DebateState = {
  setup: DebateSetup;
  round: number;
  phase: Phase;
  remainingMs: number;
  deadlineMs: number | null;
  running: boolean;
  sides: [0 | 1, 0 | 1];
  scores: [number, number];
};
export function phaseDuration(setup: DebateSetup, phase: Phase) {
  return phase === "finished"
    ? 0
    : (phase === "preparation"
        ? setup.preparationSeconds
        : setup.speakingSeconds) * 1000;
}
export function createDebate(setup: DebateSetup): DebateState {
  return {
    setup,
    round: 1,
    phase: "preparation",
    remainingMs: phaseDuration(setup, "preparation"),
    deadlineMs: null,
    running: false,
    sides: [0, 1],
    scores: [0, 0],
  };
}
export function settleTimer(state: DebateState, now: number): DebateState {
  if (!state.running || state.deadlineMs === null) return state;
  const remainingMs = Math.max(0, state.deadlineMs - now);
  return {
    ...state,
    remainingMs,
    running: remainingMs > 0,
    deadlineMs: remainingMs > 0 ? state.deadlineMs : null,
  };
}
function enterPhase(
  state: DebateState,
  phase: Phase,
  round = state.round,
): DebateState {
  return {
    ...state,
    phase,
    round,
    remainingMs: phaseDuration(state.setup, phase),
    deadlineMs: null,
    running: false,
  };
}
export type DebateAction =
  | { type: "tick" | "start" | "pause" | "switch"; now: number }
  | { type: "reset" | "next_phase" | "next_round" }
  | { type: "configure"; setup: DebateSetup }
  | { type: "score"; team: 0 | 1; delta: -1 | 1 };
export function debateReducer(
  state: DebateState,
  action: DebateAction,
): DebateState {
  switch (action.type) {
    case "configure":
      return createDebate(action.setup);
    case "tick":
      return settleTimer(state, action.now);
    case "start":
      return state.running ||
        state.phase === "finished" ||
        state.remainingMs <= 0
        ? state
        : {
            ...state,
            running: true,
            deadlineMs: action.now + state.remainingMs,
          };
    case "pause":
      return {
        ...settleTimer(state, action.now),
        running: false,
        deadlineMs: null,
      };
    case "reset":
      return enterPhase(state, state.phase);
    case "next_phase":
      if (state.phase === "finished") return state;
      if (state.phase === "preparation") return enterPhase(state, "for");
      if (state.phase === "for") return enterPhase(state, "against");
      return state.round < state.setup.rounds
        ? enterPhase(state, "preparation", state.round + 1)
        : enterPhase(state, "finished");
    case "next_round":
      return state.phase === "finished"
        ? state
        : state.round < state.setup.rounds
          ? enterPhase(state, "preparation", state.round + 1)
          : enterPhase(state, "finished");
    case "switch":
      return {
        ...settleTimer(state, action.now),
        running: false,
        deadlineMs: null,
        sides: [state.sides[1], state.sides[0]],
      };
    case "score": {
      const scores: [number, number] = [...state.scores];
      scores[action.team] = Math.min(
        999,
        Math.max(0, scores[action.team] + action.delta),
      );
      return { ...state, scores };
    }
  }
}
export function timerText(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function hasDebateProgress(state: DebateState) {
  return (
    state.running ||
    state.round > 1 ||
    state.phase !== "preparation" ||
    state.remainingMs !== phaseDuration(state.setup, state.phase) ||
    state.scores.some((score) => score > 0) ||
    state.sides[0] !== 0
  );
}
