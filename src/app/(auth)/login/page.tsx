import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { getSafeNextPath } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Вход — Teacher Copilot" };

const messages: Record<string, string> = {
  session_expired: "Сессия завершилась. Войдите снова, чтобы продолжить.",
  service_unavailable: "Не удалось проверить сессию. Попробуйте войти позже.",
  confirmation_failed:
    "Ссылка для подтверждения недействительна или истекла. Попробуйте зарегистрироваться снова.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    reason?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const message =
    typeof params.reason === "string" && Object.hasOwn(messages, params.reason)
      ? messages[params.reason]
      : undefined;
  return (
    <>
      <p className="mb-3 text-sm font-medium text-primary">Добро пожаловать</p>
      <h1 className="text-3xl font-bold tracking-tight">
        Войти в Teacher Copilot
      </h1>
      <p className="mb-8 mt-3 text-sm leading-6 text-muted-foreground">
        Продолжите работу в своём пространстве учителя.
      </p>
      <AuthForm
        mode="login"
        configured={isSupabaseConfigured()}
        next={getSafeNextPath(params.next)}
        message={message}
      />
    </>
  );
}
