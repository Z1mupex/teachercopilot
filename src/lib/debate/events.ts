export const debateEvents = [
  {
    id: "SWITCH",
    title: "Новая позиция",
    description:
      "Команды меняются сторонами и пробуют защитить противоположную позицию. Учитель выбирает момент смены.",
    tone: "orange",
  },
  {
    id: "SOURCE",
    title: "Проверьте источник",
    description:
      "Подкрепите аргумент источником: статьёй, статистикой или цитатой. Объясните, почему ему можно доверять.",
    tone: "violet",
  },
  {
    id: "QUESTION",
    title: "Вопрос соперникам",
    description:
      "Каждая команда задаёт один уточняющий вопрос другой стороне. Ответьте по существу.",
    tone: "blue",
  },
  {
    id: "EXAMPLE",
    title: "Конкретный пример",
    description:
      "Приведите реальный пример из жизни, истории или изучаемого предмета и свяжите его со своей позицией.",
    tone: "green",
  },
] as const;
export type DebateEvent = (typeof debateEvents)[number];
export const englishSupport = {
  vocabulary: [
    "claim — утверждение",
    "evidence — доказательство",
    "counterargument — контраргумент",
  ],
  agreeing: ["I agree because…", "That is a fair point."],
  disagreeing: ["I see your point, but…", "I disagree because…"],
  transitions: ["First of all,…", "On the other hand,…", "To sum up,…"],
};
