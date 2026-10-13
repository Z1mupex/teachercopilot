const plural = new Intl.PluralRules("ru");
const number = new Intl.NumberFormat("ru");

export function formatWorkCount(count: number) {
  const forms: Record<string, string> = {
    one: "работа",
    few: "работы",
    many: "работ",
    other: "работы",
  };
  return `${number.format(count)} ${forms[plural.select(count)]}`;
}
