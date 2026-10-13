import "server-only";

// Constant, script-free placeholder, served only after the normal ownership check.
export function removedImageResponse(headers: Record<string, string>) {
  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#f3f1eb"/><text x="320" y="195" text-anchor="middle" font-family="sans-serif" font-size="23" fill="#252b27">Изображение удалено</text><text x="320" y="235" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#68716a">Ответы и результаты сохранены</text></svg>',
    {
      headers: {
        ...headers,
        "Content-Type": "image/svg+xml",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    },
  );
}
