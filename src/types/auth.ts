export type AuthFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"email" | "password" | "fullName" | "confirmPassword", string[]>
  >;
};
