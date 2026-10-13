"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

import { login, register } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/types/auth";

const initialState: AuthFormState = {};

export function AuthForm({
  mode,
  configured,
  next = "/dashboard",
  message,
}: {
  mode: "login" | "register";
  configured: boolean;
  next?: string;
  message?: string;
}) {
  const isRegister = mode === "register";
  const [state, action, pending] = useActionState(
    isRegister ? register : login,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  if (state.success) {
    return (
      <div className="space-y-6">
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          <CheckCircle2 className="mb-3 size-7" aria-hidden="true" />
          {state.success}
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 font-medium text-primary"
        >
          Перейти к входу <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const fieldError = (field: keyof NonNullable<AuthFormState["fieldErrors"]>) =>
    state.fieldErrors?.[field]?.[0];
  const errorText = (field: keyof NonNullable<AuthFormState["fieldErrors"]>) =>
    fieldError(field) ? (
      <p id={`${field}-error`} className="mt-2 text-sm text-destructive">
        {fieldError(field)}
      </p>
    ) : null;

  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      {!isRegister && <input type="hidden" name="next" value={next} />}
      {(!configured || message || state.error) && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
          {state.error ??
            (!configured
              ? "Вход и регистрация временно недоступны. Попробуйте позже."
              : message)}
        </div>
      )}
      <fieldset disabled={pending} className="space-y-5">
        {isRegister && (
          <div>
            <label
              htmlFor="fullName"
              className="mb-2 block text-sm font-medium"
            >
              Ваше имя
            </label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              placeholder="Как к вам обращаться?"
              required
              minLength={2}
              maxLength={80}
              aria-invalid={Boolean(fieldError("fullName"))}
              aria-describedby={
                fieldError("fullName") ? "fullName-error" : undefined
              }
            />
            {errorText("fullName")}
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="teacher@example.com"
            required
            maxLength={254}
            aria-invalid={Boolean(fieldError("email"))}
            aria-describedby={fieldError("email") ? "email-error" : undefined}
          />
          {errorText("email")}
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Пароль
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="pr-12"
              required
              minLength={isRegister ? 8 : 1}
              maxLength={128}
              aria-invalid={Boolean(fieldError("password"))}
              aria-describedby={
                fieldError("password")
                  ? "password-error"
                  : isRegister
                    ? "password-help"
                    : undefined
              }
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {isRegister && (
            <p
              id="password-help"
              className="mt-2 text-xs text-muted-foreground"
            >
              Не менее 8 символов.
            </p>
          )}
          {errorText("password")}
        </div>
        {isRegister && (
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium"
            >
              Повторите пароль
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              aria-invalid={Boolean(fieldError("confirmPassword"))}
              aria-describedby={
                fieldError("confirmPassword")
                  ? "confirmPassword-error"
                  : undefined
              }
            />
            {errorText("confirmPassword")}
          </div>
        )}
        <Button
          type="submit"
          disabled={!configured || pending}
          className="w-full"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight className="size-4" aria-hidden="true" />
          )}
          {pending ? "Подождите…" : isRegister ? "Создать аккаунт" : "Войти"}
        </Button>
      </fieldset>
      <p className="text-center text-sm text-muted-foreground">
        {isRegister ? "Уже есть аккаунт?" : "Впервые здесь?"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-primary hover:underline"
        >
          {isRegister ? "Войти" : "Зарегистрироваться"}
        </Link>
      </p>
    </form>
  );
}
