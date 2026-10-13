import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { LOGOUT_CLEANUP_COOKIE } from "@/lib/auth/logout-cleanup";
import { LogoutCleanup } from "@/components/auth/logout-cleanup";
import { BookOpenCheck, Heart, ShieldCheck, Sparkles } from "lucide-react";

import { Brand } from "@/components/brand";
import { ThemeSelect } from "@/components/theme/theme-select";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cleanup = (await cookies()).get(LOGOUT_CLEANUP_COOKIE)?.value === "1";
  return (
    <main
      id="main-content"
      className="min-h-screen bg-card lg:grid lg:grid-cols-[1fr_1fr]"
    >
      <section className="relative hidden flex-col justify-between overflow-hidden border-r bg-gradient-to-br from-blue-50 via-background to-indigo-50 p-12 lg:flex xl:p-16 dark:from-slate-900 dark:to-indigo-950/50">
        <Brand href="/login" />
        <div className="relative z-10 my-16 max-w-lg">
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border bg-card/80 px-4 py-2 text-sm text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
            Для тех, кто учит
          </span>
          <h2 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Меньше рутины.
            <br />
            Больше времени
            <br />
            для учеников.
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Спокойное рабочее пространство для ваших заданий, классов и проверки
            работ.
          </p>
          <div className="mt-10 space-y-4 text-sm text-secondary-foreground">
            <p className="flex items-center gap-3">
              <BookOpenCheck
                className="size-5 text-primary"
                aria-hidden="true"
              />
              Все учебные материалы в одном месте
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck
                className="size-5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              Итоговое решение всегда за учителем
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Heart className="size-4 text-primary" aria-hidden="true" />
          Помогаем учителям делать больше важного
        </p>
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 size-96 rounded-full border-[60px] border-blue-100/60 dark:border-blue-900/30"
        />
      </section>
      <section className="flex min-h-screen flex-col px-6 py-8 sm:px-12 lg:justify-center xl:px-24">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="lg:hidden">
            <Brand href="/login" />
          </div>
          <div className="ml-auto">
            <ThemeSelect />
          </div>
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-8 lg:my-0">
          {cleanup ? <LogoutCleanup>{children}</LogoutCleanup> : children}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground lg:hidden">
          Больше времени для учеников
        </p>
      </section>
    </main>
  );
}
