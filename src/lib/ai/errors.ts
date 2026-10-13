import "server-only";

export type AiErrorCode =
  | "not_configured"
  | "busy"
  | "rate_limit"
  | "billing"
  | "credits_exhausted"
  | "provider"
  | "provider_configuration"
  | "network"
  | "timeout"
  | "invalid_output"
  | "incomplete"
  | "refused"
  | "audit_failed";

const messages: Record<AiErrorCode, string> = {
  not_configured:
    "AI пока не подключён. Создайте рабочий лист вручную или обратитесь к администратору.",
  busy: "Предыдущий запрос AI ещё выполняется. Дождитесь его завершения.",
  rate_limit:
    "Достигнут лимит запросов AI. Попробуйте позже или продолжите редактировать вручную.",
  billing:
    "AI недоступен из-за баланса или лимитов API. Проверьте оплату и квоты аккаунта либо создайте задания вручную.",
  credits_exhausted:
    "На аккаунте AI закончился доступный баланс. Пополните баланс API или продолжите создавать задания вручную.",
  provider: "Сервис AI временно недоступен. Попробуйте позже.",
  provider_configuration:
    "Не удалось подключиться к AI. Проверьте ключ, модель и доступ к API на сервере.",
  network:
    "Не удалось связаться с AI. Проверьте соединение и попробуйте позже.",
  timeout:
    "AI не ответил вовремя. Попробуйте позже или уменьшите количество заданий.",
  invalid_output:
    "AI вернул задания, которые не прошли проверку. Измените параметры и попробуйте ещё раз.",
  incomplete: "AI не завершил ответ. Попробуйте уменьшить количество заданий.",
  refused:
    "AI не смог выполнить этот запрос. Измените тему или дополнительные указания.",
  audit_failed:
    "Не удалось записать результат запроса AI. Обновите страницу; повторный запрос расходует лимит.",
};

export class AiRequestError extends Error {
  constructor(public readonly code: AiErrorCode) {
    super(messages[code]);
    this.name = "AiRequestError";
  }
}
