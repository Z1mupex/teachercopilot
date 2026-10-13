import { z } from "zod";

export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;
export const themeCookie = "teacher-copilot-theme";

export function parseTheme(value: unknown): Theme {
  const parsed = themeSchema.safeParse(value);
  return parsed.success ? parsed.data : "system";
}
