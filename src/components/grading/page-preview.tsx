"use client";

import { useState } from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { secondaryButtonClass } from "@/components/worksheets/labels";

export function PagePreview({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) {
    return (
      <div role="status" className="space-y-3 p-3 text-center text-sm">
        <ImageOff
          className="mx-auto size-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p>Не удалось показать страницу.</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Проверьте соединение и повторите загрузку предпросмотра. Работа
          остаётся в списке.
        </p>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => {
            setAttempt(attempt + 1);
            setFailed(false);
          }}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Повторить предпросмотр
        </button>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Private authenticated images and local blobs bypass optimization.
    <img
      key={attempt}
      src={
        src.startsWith("/") && attempt
          ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`
          : src
      }
      alt={label}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full max-w-full object-contain"
    />
  );
}
