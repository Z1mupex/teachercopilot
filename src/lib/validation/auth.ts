import { z } from "zod";

const email = z
  .string()
  .trim()
  .max(254, "Email слишком длинный.")
  .pipe(z.email("Введите корректный email."));
const password = z
  .string()
  .min(1, "Введите пароль.")
  .max(128, "Пароль слишком длинный.");

export const loginSchema = z.object({ email, password });
export const registrationSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Введите имя (не менее 2 символов).")
      .max(80, "Имя слишком длинное."),
    email,
    password: password.min(8, "Используйте не менее 8 символов."),
    confirmPassword: password,
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Пароли не совпадают.",
  });
