"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGradeConversion } from "@/actions/settings";
import { ScaleEditor } from "@/components/settings/scale-editor";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/worksheets/labels";
import type { TeacherSettings } from "@/lib/settings/schema";

export function BatchGradeConversion({
  batchId,
  initial,
  initialRevision,
  foScale,
  controlScale,
}: {
  batchId: string;
  initial: { kind: "fo" | "control"; scale: TeacherSettings["fo_scale"] };
  initialRevision: string;
  foScale: TeacherSettings["fo_scale"];
  controlScale: TeacherSettings["control_scale"];
}) {
  const [kind, setKind] = useState(initial.kind),
    [scale, setScale] = useState(initial.scale),
    [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      const result = await saveGradeConversion({
        batch: batchId,
        revision,
        kind,
        scale,
      });
      if ("error" in result)
        setNotice(result.error ?? "Не удалось сохранить шкалу.");
      else {
        setRevision(result.revision);
        setNotice("Шкала сохранена для этой работы.");
        router.refresh();
      }
    } catch {
      setNotice(
        "Не удалось подтвердить сохранение. Обновите страницу перед повтором.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border bg-card p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Оценка для дневника ·{" "}
        {initial.kind === "fo" ? "ФО, 0–10" : "Контрольная, 1–5"}
      </summary>
      <div className="mt-5 max-w-lg space-y-5">
        <p className="text-xs leading-5 text-muted-foreground">
          Шкала меняет только перевод процентов в оценку этой работы. Итоговые
          баллы ответов сохраняются; оценки в дневник автоматически не
          отправляются.
        </p>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span>Вид оценивания</span>
            <select
              className={selectClass}
              value={kind}
              onChange={(e) => {
                const next = e.target.value as "fo" | "control";
                setKind(next);
                setScale(next === "fo" ? foScale : controlScale);
              }}
            >
              <option value="fo">ФО · 0–10</option>
              <option value="control">Контрольная · СОР / СОЧ · 1–5</option>
            </select>
          </label>
          <ScaleEditor
            label="Шкала этой работы"
            value={scale}
            onChange={setScale}
            maximum={kind === "fo" ? 10 : 5}
          />
          <Button onClick={save}>
            {busy ? "Сохраняем…" : "Сохранить шкалу работы"}
          </Button>
        </fieldset>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
