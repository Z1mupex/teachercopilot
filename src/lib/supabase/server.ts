import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getEnvironment } from "@/lib/env";
import type { Database } from "@/types/database";

// Cookie writes are allowed only in Server Actions and Route Handlers.
// Read-only renders rely on src/proxy.ts to refresh cookies before rendering.
export async function createClient({
  writable = false,
}: { writable?: boolean } = {}) {
  const env = getEnvironment();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        ...(writable
          ? {
              setAll: (
                cookiesToSet: {
                  name: string;
                  value: string;
                  options: CookieOptions;
                }[],
              ) => {
                for (const { name, value, options } of cookiesToSet) {
                  cookieStore.set(name, value, options);
                }
              },
            }
          : {}),
      },
    },
  );
}
