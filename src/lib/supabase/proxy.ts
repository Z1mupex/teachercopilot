import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSessionError, reportAuthError } from "@/lib/auth/errors";
import { getSafeNextPath, isProtectedPath } from "@/lib/auth/routes";
import { getEnvironment, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");

  const redirectWithCookies = (pathname: string, reason?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (pathname === "/login" && isProtectedPath(request.nextUrl.pathname)) {
      url.searchParams.set(
        "next",
        getSafeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`),
      );
    }
    if (reason) url.searchParams.set("reason", reason);
    const redirected = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll())
      redirected.cookies.set(cookie);
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirected.headers.set(header, value);
    }
    return redirected;
  };

  if (!isSupabaseConfigured()) {
    return isProtectedPath(request.nextUrl.pathname)
      ? redirectWithCookies("/login")
      : response;
  }

  const env = getEnvironment();
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          const previousCookies = response.cookies.getAll();
          const previousHeaders = new Headers(response.headers);
          response = NextResponse.next({ request });
          for (const cookie of previousCookies) response.cookies.set(cookie);
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
          previousHeaders.forEach((value, key) => {
            if (["cache-control", "expires", "pragma"].includes(key))
              response.headers.set(key, value);
          });
          for (const [name, value] of Object.entries(headers))
            response.headers.set(name, value);
        },
      },
    },
  );

  // Verify and refresh immediately, before rendering or creating another response.
  let signedIn = false;
  let reason: string | undefined;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error && !isSessionError(error))
      reportAuthError("refresh-session", error);
    signedIn = !error && typeof data?.claims.sub === "string";
    reason = error
      ? isSessionError(error)
        ? "session_expired"
        : "service_unavailable"
      : undefined;
  } catch (error) {
    reportAuthError("refresh-session", error);
    reason = "service_unavailable";
  }

  if (!signedIn && isProtectedPath(request.nextUrl.pathname))
    return redirectWithCookies("/login", reason);

  // Do not redirect auth pages based only on a JWT. The page guard uses getUser
  // to reject deleted/banned users even while their signed token remains valid.
  return response;
}
