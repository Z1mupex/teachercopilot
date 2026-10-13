"use server";

import { cookies } from "next/headers";
import { LOGOUT_CLEANUP_COOKIE } from "@/lib/auth/logout-cleanup";

// Public acknowledgement removes only a cleanup flag; no user data or auth state.
export async function acknowledgeLogoutCleanup() {
  (await cookies()).delete(LOGOUT_CLEANUP_COOKIE);
}
