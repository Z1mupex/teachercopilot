"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const darkQuery = "(prefers-color-scheme: dark)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSystemDark() {
  return window.matchMedia(darkQuery).matches;
}

function getServerDark() {
  return false;
}

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const systemDark = useSyncExternalStore(
    subscribe,
    getSystemDark,
    getServerDark,
  );
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const Icon = dark ? Moon : Sun;

  return (
    <div
      role="group"
      aria-label="Тема оформления"
      className="flex shrink-0 items-center"
    >
      <Icon
        className="hidden size-3.5 text-muted-foreground sm:block"
        aria-hidden="true"
      />
      <Switch
        aria-label="Тёмная тема"
        checked={dark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
      <button
        type="button"
        aria-label="Тема как в системе"
        aria-pressed={theme === "system"}
        title="Как в системе"
        onClick={() => setTheme("system")}
        className={cn(
          "flex size-11 items-center justify-center rounded-md transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          theme === "system" ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Monitor className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
