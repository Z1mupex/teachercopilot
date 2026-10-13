"use client";

import { useEffect, useRef, useState } from "react";
import { changeGradingPages, refreshGradingBatch } from "@/actions/grading";
import { normalizeFile, rotateLocalPage } from "@/lib/grading/normalize";
import {
  readLocalPages,
  removeLocalPage,
  saveLocalPage,
} from "@/lib/grading/local-pages";
import {
  idSchema,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
} from "@/lib/grading/validation";
import type { LayoutCommand } from "@/lib/grading/validation";
import type { GradingBatch, GradingPage, GradingResult } from "@/types/grading";

type Local = { blob: Blob; url: string };
type FileState = { id: string; name: string; status: string; error: boolean };
export function useBatchUpload(initial: GradingBatch) {
  const [batch, setBatch] = useState(initial);
  const current = useRef(initial);
  const [locals, setLocals] = useState<Record<string, Local>>({});
  const localRef = useRef<Record<string, Local>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [pageErrors, setPageErrors] = useState<Record<string, string>>({});
  const [active, setActive] = useState("");
  const [files, setFiles] = useState<FileState[]>([]);
  const mounted = useRef(true);
  const editable = ["draft", "uploading", "ready"].includes(batch.status);

  function apply(result: GradingResult) {
    if (result.error) throw new Error(result.error);
    if (!result.batch) throw new Error("Проверка недоступна.");
    current.current = result.batch;
    setBatch(result.batch);
    return result.batch;
  }
  function setLocal(id: string, blob: Blob) {
    if (!mounted.current) return;
    const old = localRef.current[id];
    if (old) URL.revokeObjectURL(old.url);
    localRef.current = {
      ...localRef.current,
      [id]: { blob, url: URL.createObjectURL(blob) },
    };
    setLocals(localRef.current);
  }
  async function forget(id: string) {
    await removeLocalPage(initial.id, id);
    const next = { ...localRef.current };
    if (next[id]) URL.revokeObjectURL(next[id].url);
    delete next[id];
    localRef.current = next;
    setLocals(next);
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    readLocalPages(initial.id)
      .then(async (saved) => {
        const next: Record<string, Local> = {};
        for (const page of saved) {
          if (cancelled) {
            Object.values(next).forEach((page) =>
              URL.revokeObjectURL(page.url),
            );
            return;
          }
          if (
            current.current.pages.some(
              (item) => item.id === page.id && item.status === "stored",
            )
          ) {
            await removeLocalPage(initial.id, page.id);
            continue;
          }
          next[page.id] = {
            blob: page.blob,
            url: URL.createObjectURL(page.blob),
          };
        }
        if (cancelled) {
          Object.values(next).forEach((page) => URL.revokeObjectURL(page.url));
          return;
        }
        localRef.current = next;
        setLocals(next);
        setRestored(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Не удалось восстановить страницы.",
          );
          setRestored(true);
        }
      });
    return () => {
      mounted.current = false;
      cancelled = true;
      Object.values(localRef.current).forEach((page) =>
        URL.revokeObjectURL(page.url),
      );
      localRef.current = {};
    };
  }, [initial.id]);
  useEffect(() => {
    function guard(event: BeforeUnloadEvent) {
      if (lock.current || Object.keys(localRef.current).length) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось выполнить действие. Повторите попытку.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setActive("");
      setProgress("");
    }
  }
  async function command(input: LayoutCommand) {
    return apply(
      await changeGradingPages(initial.id, current.current.revision, input),
    );
  }
  function visiblePages(): GradingPage[] {
    const ids = new Set(current.current.pages.map((page) => page.id));
    return [
      ...current.current.pages,
      ...Object.keys(localRef.current)
        .filter((id) => !ids.has(id))
        .map((id) => ({
          id,
          status: "pending" as const,
          width: null,
          height: null,
          imageVersion: "local",
        })),
    ];
  }
  async function reserve() {
    const known = new Set(current.current.pages.map((page) => page.id));
    const ids = Object.keys(localRef.current).filter((id) => !known.has(id));
    if (ids.length) await command({ command: "append", ids });
  }
  async function prepare(selected: File[], targetId?: string) {
    if (targetId && selected.length !== 1)
      throw new Error("Для замены выберите одно изображение.");
    for (const file of selected) {
      const fileId = crypto.randomUUID();
      setFiles((list) => [
        ...list,
        { id: fileId, name: file.name, status: "Подготовка…", error: false },
      ]);
      try {
        await normalizeFile(
          file,
          targetId ? 1 : MAX_PAGES - visiblePages().length,
          async (page) => {
            const id = targetId ?? page.id;
            await saveLocalPage(initial.id, id, page.blob);
            setLocal(id, page.blob);
            setPageErrors((previous) => {
              const next = { ...previous };
              delete next[id];
              return next;
            });
          },
          (text) => {
            setProgress(text);
            setFiles((list) =>
              list.map((item) =>
                item.id === fileId ? { ...item, status: text } : item,
              ),
            );
          },
        );
        setFiles((list) =>
          list.map((item) =>
            item.id === fileId
              ? { ...item, status: "Подготовлен", error: false }
              : item,
          ),
        );
      } catch (err) {
        setFiles((list) =>
          list.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  status:
                    err instanceof Error
                      ? err.message
                      : "Не удалось подготовить файл.",
                  error: true,
                }
              : item,
          ),
        );
      }
    }
    await reserve();
  }
  async function pageRequest(pageId: string, rotate = false) {
    const body = rotate ? undefined : localRef.current[pageId]?.blob;
    if (!rotate && !body)
      throw new Error(
        "Выберите исходное изображение заново — в этом браузере его нет.",
      );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(
        `/grading/${initial.id}/pages/${pageId}${rotate ? "?rotate=90" : ""}`,
        {
          method: "POST",
          body,
          headers: rotate ? {} : { "Content-Type": "image/jpeg" },
          signal: controller.signal,
        },
      );
      if (response.redirected)
        throw new Error(
          "Сессия истекла. Войдите снова, затем повторите загрузку.",
        );
      const result: GradingResult = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Не удалось загрузить страницу.");
      apply(result);
      if (!rotate) await forget(pageId);
      setPageErrors((previous) => {
        const next = { ...previous };
        delete next[pageId];
        return next;
      });
    } catch (err) {
      throw new Error(
        err instanceof Error &&
          err.name !== "AbortError" &&
          !(err instanceof TypeError)
          ? err.message
          : "Запрос прерван. Проверьте соединение и повторите загрузку.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async function upload(ids: string[]) {
    await reserve();
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      setActive(id);
      setProgress(`Загрузка страницы ${index + 1} из ${ids.length}`);
      try {
        await pageRequest(id);
      } catch (err) {
        setPageErrors((previous) => ({
          ...previous,
          [id]: err instanceof Error ? err.message : "Загрузка не удалась.",
        }));
      }
    }
  }
  async function rotate(page: GradingPage) {
    if (page.status === "stored") {
      await pageRequest(page.id, true);
      return;
    }
    const local = localRef.current[page.id];
    if (!local) throw new Error("Выберите изображение для этой работы заново.");
    const blob = await rotateLocalPage(local.blob);
    await saveLocalPage(initial.id, page.id, blob);
    setLocal(page.id, blob);
  }
  async function remove(id: string) {
    if (!window.confirm("Удалить эту страницу из проверки?")) return;
    if (current.current.pages.some((page) => page.id === id))
      await command({ command: "remove", id });
    if (localRef.current[id]) await forget(id);
  }
  async function move(index: number, direction: number) {
    await reserve();
    const ids = current.current.pages.map((page) => page.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    await command({ command: "reorder", ids });
  }
  async function refresh() {
    const next = apply(await refreshGradingBatch(initial.id));
    for (const page of next.pages)
      if (page.status === "stored" && localRef.current[page.id])
        await forget(page.id);
  }
  async function saveCapture(page: { id: string; blob: Blob }) {
    if (
      !idSchema.safeParse(page.id).success ||
      page.blob.type !== "image/jpeg" ||
      page.blob.size <= 0 ||
      page.blob.size > MAX_UPLOAD_BYTES
    )
      throw new Error("Нужен JPEG-снимок не больше 6 МБ.");
    // Persist before network work. Retrying always uses this same immutable ID/blob.
    await saveLocalPage(initial.id, page.id, page.blob);
    setLocal(page.id, page.blob);
    // Recover a lost append/store acknowledgement and use the current revision.
    await refresh();
    if (
      current.current.pages.some(
        (item) => item.id === page.id && item.status === "stored",
      )
    )
      return;
    if (!["draft", "uploading", "ready"].includes(current.current.status))
      throw new Error(
        "Проверка уже обрабатывается. Новые снимки добавить нельзя.",
      );
    if (visiblePages().length > MAX_PAGES)
      throw new Error(`В проверке может быть не больше ${MAX_PAGES} страниц.`);
    await reserve();
    await pageRequest(page.id);
  }
  const pages = [
    ...batch.pages,
    ...Object.keys(locals)
      .filter((id) => !batch.pages.some((page) => page.id === id))
      .map((id) => ({
        id,
        status: "pending" as const,
        width: null,
        height: null,
        imageVersion: "local",
      })),
  ];
  const stored = pages.filter((page) => page.status === "stored").length;
  const pending = pages
    .filter((page) => page.status !== "stored")
    .map((page) => page.id);
  return {
    batch,
    pages,
    locals,
    busy,
    restored,
    error,
    progress,
    pageErrors,
    active,
    files,
    editable,
    stored,
    pending,
    run,
    prepare,
    upload,
    rotate,
    remove,
    move,
    refresh,
    saveCapture,
    finish: async () => {
      await command({ command: "finish" });
    },
  };
}
