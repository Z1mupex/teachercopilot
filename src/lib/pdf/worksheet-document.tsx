import "server-only";

import { join } from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  printableWorksheetSchema,
  type PrintableWorksheet,
} from "@/lib/pdf/student-worksheet";

Font.register({
  family: "Noto Sans",
  fonts: [
    {
      src: join(process.cwd(), "src/lib/pdf/fonts/NotoSans-Regular.ttf"),
      fontWeight: 400,
    },
    {
      src: join(process.cwd(), "src/lib/pdf/fonts/NotoSans-Bold.ttf"),
      fontWeight: 700,
    },
  ],
});
Font.register({
  family: "Noto Sans Math",
  src: join(process.cwd(), "src/lib/pdf/fonts/NotoSansMath-Regular.ttf"),
});
// Keep Russian words intact; unusually long tokens can still wrap safely.
Font.registerHyphenationCallback((word) =>
  word.length > 32 ? (word.match(/.{1,24}/gu) ?? [word]) : [word],
);

const styles = StyleSheet.create({
  page: {
    fontFamily: ["Noto Sans", "Noto Sans Math"],
    fontSize: 10,
    color: "#151515",
    paddingTop: 46,
    paddingBottom: 48,
    paddingHorizontal: 46,
  },
  heading: { fontSize: 19, fontWeight: 700, marginBottom: 7 },
  subject: { fontSize: 10, color: "#555555", marginBottom: 9 },
  label: { fontSize: 12, fontWeight: 700, marginBottom: 16 },
  name: { flexDirection: "row", gap: 12, marginBottom: 24 },
  nameField: {
    flex: 3,
    borderBottomWidth: 0.7,
    borderBottomColor: "#555555",
    paddingBottom: 5,
  },
  smallField: { flex: 1 },
  question: { marginBottom: 18 },
  questionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 7,
  },
  number: { width: 21, fontSize: 11, fontWeight: 700 },
  prompt: { flex: 1 },
  score: { width: 64, textAlign: "right", fontSize: 9, color: "#555555" },
  option: { marginLeft: 31, marginBottom: 4 },
  line: {
    marginLeft: 31,
    height: 22,
    borderBottomWidth: 0.45,
    borderBottomColor: "#aaaaaa",
  },
  footer: {
    position: "absolute",
    bottom: 23,
    left: 46,
    right: 46,
    fontSize: 8,
    textAlign: "right",
    color: "#666666",
  },
});

export function WorksheetDocument({
  worksheet,
}: {
  worksheet: PrintableWorksheet;
}) {
  return (
    <Document
      title={worksheet.title}
      language="ru-RU"
      creator="Teacher Copilot"
    >
      {worksheet.variants.map((variant) => (
        <Page key={variant.id ?? "base"} size="A4" style={styles.page} wrap>
          <View wrap={false}>
            <Text style={styles.heading}>{worksheet.title}</Text>
            {(worksheet.subject || worksheet.grade) && (
              <Text style={styles.subject}>
                {[
                  worksheet.subject,
                  worksheet.grade === null ? null : `${worksheet.grade} класс`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
            <Text style={styles.label}>{variant.label}</Text>
            <View style={styles.name}>
              <Text style={styles.nameField}>ФИО ученика:</Text>
              <Text style={[styles.nameField, styles.smallField]}>Класс:</Text>
              <Text style={[styles.nameField, styles.smallField]}>Дата:</Text>
            </View>
          </View>
          {variant.questions.map((question, index) => (
            <View key={index} style={styles.question}>
              <View
                style={styles.questionHeader}
                minPresenceAhead={question.type === "open_response" ? 155 : 65}
              >
                <Text style={styles.number}>{index + 1}.</Text>
                <Text style={styles.prompt} orphans={3} widows={3}>
                  {question.prompt}
                </Text>
                <Text style={styles.score}>{question.max_score} балл(ов)</Text>
              </View>
              {question.type === "multiple_choice" ? (
                question.options.map((option, optionIndex) => (
                  <Text
                    key={optionIndex}
                    style={styles.option}
                    orphans={2}
                    widows={2}
                  >
                    {String.fromCharCode(1040 + optionIndex)}) {option}
                  </Text>
                ))
              ) : (
                <View wrap={false}>
                  {Array.from(
                    { length: question.type === "open_response" ? 7 : 2 },
                    (_, lineIndex) => (
                      <View key={lineIndex} style={styles.line} />
                    ),
                  )}
                </View>
              )}
            </View>
          ))}
          <Text
            fixed
            style={styles.footer}
            render={({ pageNumber, totalPages }) =>
              `${variant.label} | ${pageNumber} / ${totalPages}`
            }
          />
        </Page>
      ))}
    </Document>
  );
}

export async function renderWorksheetPdf(worksheet: PrintableWorksheet) {
  // Runtime strict validation also rejects accidentally supplied answer fields.
  const printable = printableWorksheetSchema.parse(worksheet);
  return renderToBuffer(<WorksheetDocument worksheet={printable} />);
}
