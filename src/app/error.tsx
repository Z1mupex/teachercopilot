"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-bold">Не удалось загрузить страницу</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Сервис временно недоступен. Попробуйте ещё раз через некоторое время.
      </p>
      <Button onClick={reset}>Попробовать снова</Button>
      <Link href="/login" className="text-sm font-medium text-primary">
        Вернуться ко входу
      </Link>
    </main>
  );
}
