"use client";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ru">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "48px 24px",
          textAlign: "center",
          colorScheme: "light dark",
        }}
      >
        <title>Ошибка — Teacher Copilot</title>
        <h1>Не удалось открыть Teacher Copilot</h1>
        <p>Проверьте соединение и попробуйте снова.</p>
        <button
          onClick={retry}
          style={{ padding: "12px 20px", cursor: "pointer" }}
        >
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
