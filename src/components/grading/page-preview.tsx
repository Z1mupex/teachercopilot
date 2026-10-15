"use client";
/* eslint-disable @next/next/no-img-element -- Owned private images and local blobs bypass Next image optimization. */

import { useState } from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { secondaryButtonClass } from "@/components/worksheets/labels";

export function PagePreview({
  src,
  label,
  previewSrc,
}: {
  src: string;
  label: string;
  previewSrc?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
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
  if (previewSrc)
    return (
      <span className="relative flex h-full w-full items-center justify-center">
        {!loaded && (
          <img
            src={previewSrc}
            alt=""
            loading="lazy"
            className="h-full max-w-full object-contain"
          />
        )}
        <img
          src={src + (attempt ? `?retry=${attempt}` : "")}
          alt={label}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-contain ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      </span>
    );
  return (
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
