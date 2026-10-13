import Link from "next/link";
import { ThemeSelect } from "@/components/theme/theme-select";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <ThemeSelect />
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-3xl font-bold">Страница не найдена</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Проверьте адрес или вернитесь в рабочее пространство.
      </p>
      <Link
        href="/dashboard"
        className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        На панель
      </Link>
    </main>
  );
}
