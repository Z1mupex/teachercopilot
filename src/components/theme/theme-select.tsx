"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { parseTheme } from "@/lib/validation/theme";

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;
  return (
    <label className="relative inline-flex shrink-0 items-center">
      <span className="sr-only">Тема оформления</span>
      <Icon
        className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        aria-label="Тема оформления"
        value={theme}
        onChange={(event) => setTheme(parseTheme(event.target.value))}
        className="h-11 w-11 cursor-pointer appearance-none rounded-xl border bg-card pl-9 text-transparent outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring sm:w-40 sm:pr-3 sm:text-sm sm:text-foreground"
      >
        <option value="light" className="bg-card text-sm text-foreground">
          Светлая
        </option>
        <option value="dark" className="bg-card text-sm text-foreground">
          Тёмная
        </option>
        <option value="system" className="bg-card text-sm text-foreground">
          Как в системе
        </option>
      </select>
    </label>
  );
}
