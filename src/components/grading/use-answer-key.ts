"use client";
import { gradingRequest } from "@/lib/grading/client-http";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveAnswerKey } from "@/actions/answer-keys";
import {
  answerKeySchema,
  MAX_ANSWER_BODY,
  MAX_ANSWER_PAGES,
  type AnswerKeyDetail,
  type AnswerKeyInput,
} from "@/lib/grading/answer-key-validation";
import {
  createEmptyQuestion,
  duplicateQuestion,
} from "@/lib/worksheets/domain";
import { normalizeFile } from "@/lib/grading/normalize";
import type { QuestionInput, QuestionType } from "@/types/worksheets";
import {
  locateAnswerKeyIssues,
  restoreAnswerQuestion,
  type AnswerKeyIssue,
  type RemovedAnswerQuestion,
} from "@/lib/grading/answer-key-editor";

function draft(input: AnswerKeyInput): AnswerKeyInput {
  return {
    document: { ...input.document, status: "draft" },
    source: input.source,
    review: input.review,
    confirmed: false,
  };
}
export function useAnswerKey(batchId: string, initial: AnswerKeyDetail) {
  const form = useForm<AnswerKeyInput>({
    resolver: zodResolver(answerKeySchema),
    defaultValues: draft(initial),
  });
  const value = useWatch({ control: form.control }) as AnswerKeyInput;
  const [saved, setSaved] = useState(initial);
  const [active, setActive] = useState(0);
  const [source, setSource] = useState<
    "manual" | "photo" | "file" | "solved_teacher"
  >("manual");
  const [newType, setNewType] = useState<QuestionType>("short_answer");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState(false);
  const [validationIssues, setValidationIssues] = useState<AnswerKeyIssue[]>(
    [],
  );
  const [validationTarget, setValidationTarget] =
    useState<AnswerKeyIssue | null>(null);
  const [removedQuestion, setRemovedQuestion] =
    useState<RemovedAnswerQuestion | null>(null);
  const variants = value.document.variants ?? [];
  const groups = [
    { id: "base", label: "Вариант 1", questions: value.document.questions },
    ...variants,
  ];
  const group = groups[Math.min(active, groups.length - 1)];
  const total = groups.reduce((sum, g) => sum + g.questions.length, 0);
  const unreviewed = value.review.filter((r) => !r.reviewed).length;
  const dirty = form.formState.isDirty;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) event.preventDefault();
    };
    const beforeNavigation = (event: MouseEvent) => {
      if (
        (!dirty && !busy) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        target.href === window.location.href ||
        (target.hash && target.pathname === window.location.pathname)
      )
        return;
      if (
        !window.confirm(
          busy
            ? "Запрос ещё выполняется. Уйти со страницы?"
            : "Есть несохранённые ответы. Уйти со страницы и потерять правки?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [dirty, busy]);
  function edit(next: AnswerKeyInput) {
    setValidationIssues([]);
    setValidationTarget(null);
    form.setValue(
      "document",
      { ...next.document, status: "draft" },
      { shouldDirty: true },
    );
    form.setValue("source", next.source, { shouldDirty: true });
    form.setValue("review", next.review, { shouldDirty: true });
    form.setValue("confirmed", false);
    setChecked(false);
    setNotice("");
    setError("");
  }
  function changeQuestions(questions: QuestionInput[], review = value.review) {
    const document =
      active === 0
        ? { ...value.document, questions }
        : {
            ...value.document,
            variants: variants.map((v, index) =>
              index === active - 1 ? { ...v, questions } : v,
            ),
          };
    const ids = new Set(
      [document.questions, ...(document.variants ?? []).map((v) => v.questions)]
        .flat()
        .map((q) => q.id),
    );
    edit({
      ...value,
      document,
      review: review.filter((r) => ids.has(r.question_id)),
    });
  }
  function changeQuestion(question: QuestionInput) {
    changeQuestions(
      group.questions.map((q) => (q.id === question.id ? question : q)),
      value.review.map((r) =>
        r.question_id === question.id ? { ...r, reviewed: false } : r,
      ),
    );
  }
  function changeType(question: QuestionInput, type: QuestionType) {
    if (question.type === type) return;
    const next = createEmptyQuestion(type);
    next.id = question.id;
    next.prompt = question.prompt;
    next.max_score = question.max_score;
    if (next.type === "multiple_choice")
      next.options = next.options.map((o, index) => ({
        ...o,
        text: "ABCD"[index],
      }));
    changeQuestion(next);
  }
  function addQuestion() {
    if (group.questions.length >= 100 || total >= 300) return;
    const question = createEmptyQuestion(newType);
    question.prompt = `Задание ${group.questions.length + 1}`;
    if (question.type === "multiple_choice")
      question.options = question.options.map((o, index) => ({
        ...o,
        text: "ABCD"[index],
      }));
    changeQuestions([...group.questions, question]);
  }
  function move(index: number, position: number) {
    if (
      position < 0 ||
      position >= group.questions.length ||
      !Number.isInteger(position)
    )
      return;
    const questions = [...group.questions];
    const [question] = questions.splice(index, 1);
    questions.splice(position, 0, question);
    changeQuestions(questions);
  }
  function duplicate(question: QuestionInput) {
    if (group.questions.length >= 100 || total >= 300) return;
    const copy = duplicateQuestion(question);
    const mark = value.review.find((r) => r.question_id === question.id);
    changeQuestions(
      [...group.questions, copy],
      mark
        ? [...value.review, { ...mark, question_id: copy.id, reviewed: false }]
        : value.review,
    );
  }
  function addVariant() {
    if (groups.length >= 10) return;
    const used = new Set(groups.map((g) => g.label.toLowerCase()));
    let number = 2;
    while (used.has(`вариант ${number}`)) number++;
    edit({
      ...value,
      document: {
        ...value.document,
        variants: [
          ...variants,
          {
            id: crypto.randomUUID(),
            label: `Вариант ${number}`,
            questions: [],
          },
        ],
      },
    });
    setActive(groups.length);
  }
  function removeVariant() {
    if (active === 0) return;
    if (
      !window.confirm(
        `Удалить «${group.label}» и все задания в нём (${group.questions.length})? Сохранённый ключ изменится после сохранения черновика.`,
      )
    )
      return;
    if (removedQuestion?.groupId === group.id) setRemovedQuestion(null);
    const removed = new Set(group.questions.map((q) => q.id));
    edit({
      ...value,
      document: {
        ...value.document,
        variants: variants.filter((_, index) => index !== active - 1),
      },
      review: value.review.filter((r) => !removed.has(r.question_id)),
    });
    setActive(0);
  }
  function removeQuestion(question: QuestionInput) {
    setRemovedQuestion({
      groupId: group.id,
      position: group.questions.findIndex((q) => q.id === question.id),
      question,
      review: value.review.find((r) => r.question_id === question.id),
    });
    changeQuestions(group.questions.filter((q) => q.id !== question.id));
  }
  function undoRemoveQuestion() {
    if (!removedQuestion) return;
    const restored = restoreAnswerQuestion(value, removedQuestion);
    if (!restored) {
      setError(
        "Не удалось вернуть задание: вариант удалён или достигнут предел заданий.",
      );
      return;
    }
    edit(restored);
    setActive(
      removedQuestion.groupId === "base"
        ? 0
        : (restored.document.variants ?? []).findIndex(
            (v) => v.id === removedQuestion.groupId,
          ) + 1,
    );
    setRemovedQuestion(null);
    setNotice("Удалённое задание и его отметки проверки восстановлены.");
  }
  async function commit(confirm: boolean) {
    setError("");
    setNotice("");
    if (confirm && !checked) {
      setError("Подтвердите, что проверили все ответы и баллы.");
      return;
    }
    form.setValue("confirmed", confirm);
    form.setValue("document.status", confirm ? "ready" : "draft");
    await form.handleSubmit(
      async (input) => {
        setBusy(true);
        try {
          const result = await saveAnswerKey(batchId, saved.revision, input);
          if (result.error) {
            setError(result.error);
            return;
          }
          if (!result.data) throw new Error("Не удалось перечитать ответы.");
          setSaved(result.data);
          form.reset(draft(result.data));
          setRemovedQuestion(null);
          setValidationIssues([]);
          setValidationTarget(null);
          setChecked(false);
          setNotice(
            confirm
              ? "Ответы и баллы подтверждены. Распознавание работ учеников ещё не запускалось."
              : "Черновик ответов сохранён. Для использования его нужно подтвердить.",
          );
        } catch {
          setError(
            "Не удалось сохранить ответы. Проверьте соединение и повторите попытку.",
          );
        } finally {
          setBusy(false);
        }
      },
      () => {
        const parsed = answerKeySchema.safeParse(form.getValues());
        const issues = parsed.success
          ? []
          : locateAnswerKeyIssues(form.getValues(), parsed.error.issues);
        setValidationIssues(issues);
        setValidationTarget(issues[0] ?? null);
        if (issues[0]) setActive(issues[0].groupIndex);
        setError(
          parsed.success
            ? "Проверьте заполнение ответов."
            : parsed.error.issues[0].message,
        );
      },
    )();
  }
  async function recognize() {
    if (source === "manual" || files.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const pages: Blob[] = [];
      if (files.length > MAX_ANSWER_PAGES)
        throw new Error(
          "За один запрос можно выбрать не больше 3 изображений или PDF с 1–3 страницами.",
        );
      for (const file of files)
        await normalizeFile(
          file,
          MAX_ANSWER_PAGES - pages.length,
          async (page) => {
            pages.push(page.blob);
          },
          setNotice,
        );
      const payload = new FormData();
      payload.set("source", source);
      payload.set("revision", saved.revision);
      pages.forEach((page, index) =>
        payload.append("pages", page, `page-${index + 1}.jpg`),
      );
      if (
        pages.reduce((sum, page) => sum + page.size, 0) >
        MAX_ANSWER_BODY - 4096
      )
        throw new Error(
          "Подготовленные страницы превышают 12 МБ. Уменьшите документ.",
        );
      setNotice("Распознаём ответы…");
      const body: unknown = await gradingRequest(
        `/grading/${batchId}/answers/parse`,
        payload,
      );
      const result = z
        .object({ data: answerKeySchema, revision: z.string() })
        .parse(body);
      if (result.revision !== saved.revision)
        throw new Error(
          "Проверка изменилась. Обновите страницу перед повтором.",
        );
      edit(result.data);
      setRemovedQuestion(null);
      setActive(0);
      setNotice(
        "Мы распознали ответы так. Проверьте каждое задание, сомнительные поля и баллы. Ответы ещё не сохранены.",
      );
    } catch (failure) {
      setNotice("");
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось прочитать документ.",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    value,
    saved,
    active,
    setActive,
    source,
    setSource,
    newType,
    setNewType,
    files,
    setFiles,
    busy,
    error,
    notice,
    checked,
    validationIssues,
    validationTarget,
    removedQuestion,
    removeQuestion,
    undoRemoveQuestion,
    setChecked,
    groups,
    group,
    total,
    unreviewed,
    dirty,
    edit,
    changeQuestions,
    changeQuestion,
    changeType,
    addQuestion,
    move,
    duplicate,
    addVariant,
    removeVariant,
    commit,
    recognize,
  };
}
