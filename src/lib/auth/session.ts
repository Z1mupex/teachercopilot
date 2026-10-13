import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { isSessionError, reportAuthError } from "@/lib/auth/errors";
import { getSafeNextPath } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (isSessionError(error)) return null;
    reportAuthError("get-user", error);
    throw new Error("Authentication service unavailable");
  }

  return data.user;
});

export async function requireUser(next = "/dashboard") {
  const user = await getCurrentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent(getSafeNextPath(next))}`);
  return user;
}
