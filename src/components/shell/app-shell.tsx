import type { ReactNode } from "react";
import { Menu } from "lucide-react";

import { Brand } from "@/components/brand";
import { Navigation } from "@/components/shell/navigation";
import { HeaderContext } from "@/components/shell/header-context";
import { NotificationsMenu } from "@/components/shell/notifications-menu";
import { RetentionCleanup } from "@/components/settings/retention-cleanup";
import { ProfileDropdown } from "@/components/shell/profile-dropdown";
import { ThemeSelect } from "@/components/theme/theme-select";

export function AppShell({
  children,
  displayName,
  email,
  retentionEnabled = false,
}: {
  children: ReactNode;
  displayName: string;
  email?: string;
  retentionEnabled?: boolean;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Brand />
        </div>
        <div className="flex-1 px-3 py-5">
          <Navigation />
        </div>
        <div className="mx-5 border-t py-5">
          <p className="text-xs font-medium">Материалы. Уроки. Решения.</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Пространство для вашей работы.
          </p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-2 border-b bg-background px-4 sm:gap-4 sm:px-8">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <HeaderContext />
          <div className="flex shrink-0 items-center gap-1 sm:gap-4">
            <ThemeSelect />
            <NotificationsMenu />
            <span
              className="hidden h-5 w-px bg-border sm:block"
              aria-hidden="true"
            />
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
          className="mx-auto max-w-[1400px] px-4 py-7 sm:px-8 sm:py-9"
        >
          <RetentionCleanup enabled={retentionEnabled} />
          {children}
        </main>
      </div>
    </div>
  );
}
