import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import localFont from "next/font/local";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { parseTheme, themeCookie } from "@/lib/validation/theme";

import "./globals.css";

const studioFont = localFont({
  src: [
    {
      path: "../lib/pdf/fonts/NotoSans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../lib/pdf/fonts/NotoSans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-studio",
});

export const metadata: Metadata = {
  title: "Teacher Copilot",
  description: "Помощник учителя для создания заданий и проверки работ.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = parseTheme((await cookies()).get(themeCookie)?.value);
  return (
    <html lang="ru" data-theme={theme} className={studioFont.variable}>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-xl bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Перейти к содержимому
        </a>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
