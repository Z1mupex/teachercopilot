"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LOGOUT_CLEANUP_COOKIE } from "@/lib/auth/logout-cleanup";

import {
  getAuthErrorMessage,
  reportAuthError,
  isSessionError,
} from "@/lib/auth/errors";
import { getSafeNextPath } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, registrationSchema } from "@/lib/validation/auth";
import type { AuthFormState } from "@/types/auth";

const unavailable = "Вход временно недоступен. Попробуйте позже.";

export async function login(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!isSupabaseConfigured()) return { error: unavailable };

  try {
    const supabase = await createClient({ writable: true });
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      reportAuthError("login", error);
      return { error: getAuthErrorMessage(error) };
    }
  } catch (error) {
    reportAuthError("login", error);
    return { error: unavailable };
  }

  revalidatePath("/", "layout");
  redirect(getSafeNextPath(formData.get("next")));
}

export async function register(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registrationSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success)
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!isSupabaseConfigured()) return { error: unavailable };

  let signedIn = false;
  try {
    const supabase = await createClient({ writable: true });
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      // Display metadata only; never use user-editable metadata for authorization.
      options: { data: { full_name: parsed.data.fullName } },
    });
    if (error) {
      reportAuthError("register", error);
      return { error: getAuthErrorMessage(error) };
    }
    signedIn = Boolean(data.session);
  } catch (error) {
    reportAuthError("register", error);
    return { error: unavailable };
  }

  if (signedIn) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }
  return {
    success:
      "Проверьте почту: если регистрация доступна для этого адреса, мы отправили ссылку для подтверждения email.",
  };
}

export async function logout(): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    await markLogoutCleanup();
    redirect("/login");
  }

  try {
    const supabase = await createClient({ writable: true });
    const { error: userError } = await supabase.auth.getUser();
    if (userError && !isSessionError(userError)) {
      reportAuthError("logout-verify", userError);
      return { error: "Не удалось выйти. Попробуйте снова." };
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      reportAuthError("logout", error);
      return { error: "Не удалось выйти. Попробуйте снова." };
    }
  } catch (error) {
    reportAuthError("logout", error);
    return { error: "Не удалось выйти. Попробуйте снова." };
  }

  await markLogoutCleanup();
  revalidatePath("/", "layout");
  redirect("/login");
}

async function markLogoutCleanup() {
  (await cookies()).set(LOGOUT_CLEANUP_COOKIE, "1", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}
