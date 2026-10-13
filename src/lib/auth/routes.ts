export const applicationRoutes = [
  { href: "/dashboard", label: "Панель", icon: "home" },
  { href: "/grading", label: "Проверка работ", icon: "clipboard" },
  { href: "/worksheets/new", label: "Создать работу", icon: "plus" },
  { href: "/classes", label: "Классы", icon: "users" },
  { href: "/analytics", label: "Аналитика", icon: "chart" },
  { href: "/debate", label: "Debate Arena", icon: "messages" },
  { href: "/library", label: "Библиотека", icon: "book" },
  { href: "/settings", label: "Настройки", icon: "settings" },
] as const;

const protectedRoots = [
  "/dashboard",
  "/grading",
  "/worksheets",
  "/classes",
  "/analytics",
  "/debate",
  "/library",
  "/settings",
];

export function isProtectedPath(pathname: string) {
  return protectedRoots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

// Only known application paths can be a post-login destination.
export function getSafeNextPath(input: unknown): string {
  if (
    typeof input !== "string" ||
    !input.startsWith("/") ||
    input.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(input)
  ) {
    return "/dashboard";
  }

  try {
    const url = new URL(input, "https://teacher-copilot.invalid");
    if (
      url.origin !== "https://teacher-copilot.invalid" ||
      !isProtectedPath(url.pathname)
    ) {
      return "/dashboard";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    // Malformed, untrusted redirect input is rejected explicitly.
    return "/dashboard";
  }
}
