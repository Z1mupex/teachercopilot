import type { AuthError } from "@supabase/supabase-js";

export function isSessionError(error: AuthError) {
  return (
    error.name === "AuthSessionMissingError" ||
    [
      "session_not_found",
      "session_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "refresh_token_expired",
      "bad_jwt",
      "user_not_found",
      "user_banned",
    ].includes(error.code ?? "")
  );
}

export function reportAuthError(operation: string, error: unknown) {
  // Do not log tokens, passwords, email addresses, or raw provider responses.
  if (error && typeof error === "object") {
    console.error("Authentication failed", {
      operation,
      name:
        "name" in error && typeof error.name === "string"
          ? error.name
          : "UnknownError",
      code:
        "code" in error && typeof error.code === "string"
          ? error.code
          : undefined,
      status:
        "status" in error && typeof error.status === "number"
          ? error.status
          : undefined,
    });
  } else {
    console.error("Authentication failed", { operation, name: "UnknownError" });
  }
}

export function getAuthErrorMessage(error: AuthError) {
  switch (error.code) {
    case "invalid_credentials":
      return "Неверный email или пароль.";
    case "email_not_confirmed":
      return "Подтвердите email по ссылке в письме, затем войдите.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Слишком много попыток. Подождите немного и попробуйте снова.";
    case "weak_password":
      return "Выберите более надёжный пароль.";
    default:
      return "Не удалось выполнить запрос. Попробуйте позже.";
  }
}
