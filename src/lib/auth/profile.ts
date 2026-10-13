import { z } from "zod";
import type { User } from "@supabase/supabase-js";

export function getDisplayName(user: Pick<User, "email" | "user_metadata">) {
  const profile = z
    .object({ full_name: z.string().trim().min(1).max(80) })
    .safeParse(user.user_metadata);
  return profile.success
    ? profile.data.full_name
    : user.email?.split("@")[0] || "Учитель";
}
