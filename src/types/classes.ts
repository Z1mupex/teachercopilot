import type { Database } from "@/types/database";

export type TeacherClass = Database["public"]["Tables"]["classes"]["Row"];
export type ClassFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"name" | "grade" | "subject" | "student_count", string[]>
  >;
};
