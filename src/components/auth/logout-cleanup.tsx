"use client";

import { useEffect, useState, type ReactNode } from "react";
import { acknowledgeLogoutCleanup } from "@/actions/logout-cleanup";
import { clearLocalPages } from "@/lib/grading/local-pages";
import { Button } from "@/components/ui/button";

export function LogoutCleanup({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    async function clean() {
      try {
        await clearLocalPages();
        await acknowledgeLogoutCleanup();
        if (active) setDone(true);
      } catch {
        if (active) setError(true);
      }
    }
    void clean();
    return () => {
      active = false;
    };
  }, [retry]);
  if (done) return children;
  return (
    <div
      role={error ? "alert" : "status"}
      className="space-y-4 text-sm text-muted-foreground"
    >
      <p>
        {error
          ? "Вы вышли из аккаунта, но браузер не смог очистить несохранённые работы. Повторите очистку перед следующим входом."
          : "Удаляем несохранённые работы из этого браузера…"}
      </p>
      {error && (
        <Button
          onClick={() => {
            setError(false);
            setRetry((value) => value + 1);
          }}
        >
          Повторить очистку
        </Button>
      )}
    </div>
  );
}
