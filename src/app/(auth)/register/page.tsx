import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Регистрация — Teacher Copilot" };

export default function RegisterPage() {
  return (
    <>
      <p className="mb-3 text-sm font-medium text-primary">Начнём знакомство</p>
      <h1 className="text-3xl font-bold tracking-tight">Создать аккаунт</h1>
      <p className="mb-8 mt-3 text-sm leading-6 text-muted-foreground">
        Ваше рабочее пространство начинается здесь.
      </p>
      <AuthForm mode="register" configured={isSupabaseConfigured()} />
    </>
  );
}
