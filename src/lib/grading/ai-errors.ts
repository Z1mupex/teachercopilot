import "server-only";
import type { AiRequestError } from "@/lib/ai/errors";
export function gradingAiMessage(error: AiRequestError) {
  const messages: Partial<Record<AiRequestError["code"], string>> = {
    not_configured:
      "AI пока не подключён. Обратитесь к администратору для настройки распознавания.",
    busy: "Другие работы ещё обрабатываются. Дождитесь завершения и повторите эту работу.",
    rate_limit:
      "Достигнут лимит AI. Дождитесь его сброса и повторите эту работу.",
    invalid_output:
      "Распознанные ответы не прошли проверку. Проверьте читаемость оригинала и повторите эту работу.",
    incomplete:
      "AI не смог полностью разобрать работу. Проверьте читаемость страницы и допустимый размер ключа, затем повторите попытку.",
    timeout: "AI не ответил вовремя. Повторите обработку этой работы.",
    refused:
      "AI не смог разобрать эту работу. Проверьте оригинал и повторите попытку.",
  };
  return messages[error.code] ?? error.message;
}
