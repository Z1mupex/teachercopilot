import { NextResponse, type NextRequest } from "next/server";

import { reportAuthError } from "@/lib/auth/errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const destination = request.nextUrl.clone();
  destination.pathname = "/login";
  destination.search = "";
  destination.searchParams.set("reason", "confirmation_failed");

  if (tokenHash && type === "email" && isSupabaseConfigured()) {
    try {
      const supabase = await createClient({ writable: true });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (!error) {
        destination.pathname = "/dashboard";
        destination.search = "";
      } else {
        reportAuthError("confirm-email", error);
      }
    } catch (error) {
      reportAuthError("confirm-email", error);
    }
  }

  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
