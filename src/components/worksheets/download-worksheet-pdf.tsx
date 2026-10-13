"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadWorksheetPdf({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const response = await fetch(`/worksheets/${id}/pdf`, {
                cache: "no-store",
              });
              if (
                !response.ok ||
                response.headers.get("Content-Type") !== "application/pdf"
              ) {
                const body: unknown = response.headers
                  .get("Content-Type")
                  ?.includes("application/json")
                  ? await response.json()
                  : null;
                const message =
                  body &&
                  typeof body === "object" &&
                  "error" in body &&
                  typeof body.error === "string"
                    ? body.error
                    : "Не удалось скачать PDF. Обновите страницу и проверьте вход в аккаунт.";
                setError(message);
                return;
              }
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 150)}.pdf`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
            } catch {
              setError(
                "Не удалось скачать PDF. Проверьте соединение и попробуйте ещё раз.",
              );
            }
          })
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
        {pending ? "Создаём PDF…" : "Скачать все варианты PDF"}
      </Button>
      {error && (
        <p role="alert" className="max-w-sm text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
