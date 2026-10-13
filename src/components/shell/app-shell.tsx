import type { ReactNode } from "react";
import { Heart, Menu, Sprout } from "lucide-react";

import { Brand } from "@/components/brand";
import { Navigation } from "@/components/shell/navigation";
import { ProfileDropdown } from "@/components/shell/profile-dropdown";
import { ThemeSelect } from "@/components/theme/theme-select";

export function AppShell({
  children,
  displayName,
  email,
}: {
  children: ReactNode;
  displayName: string;
  email?: string;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-card/70 lg:flex">
        <div className="flex h-20 items-center border-b px-5">
          <Brand />
        </div>
        <div className="flex-1 px-3 py-6">
          <Navigation />
        </div>
        <div className="m-5 flex items-end gap-3 rounded-2xl bg-secondary p-4">
          <p className="text-sm leading-6 text-secondary-foreground">
            Помогаем учителям делать больше важного{" "}
            <Heart
              className="inline size-3.5 fill-blue-300 text-blue-300"
              aria-hidden="true"
            />
          </p>
          <Sprout
            className="size-12 shrink-0 text-emerald-500/70"
            aria-hidden="true"
          />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 items-center justify-between gap-2 border-b bg-card px-4 sm:gap-4 sm:px-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <p className="hidden text-sm text-muted-foreground lg:block">
            Ваше рабочее пространство
          </p>
          <div className="flex items-center gap-1 sm:gap-3">
            <ThemeSelect />
            <ProfileDropdown displayName={displayName} email={email} />
          </div>
        </header>
        <details className="border-b bg-card px-5 py-3 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <Menu className="size-5" aria-hidden="true" />
            Разделы приложения
          </summary>
          <div className="pt-3">
            <Navigation />
          </div>
        </details>
        <main
          id="main-content"
          className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 sm:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
