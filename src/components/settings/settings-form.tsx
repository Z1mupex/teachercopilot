"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type FieldPath,
  type FieldPathValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  UserRound,
  SlidersHorizontal,
  Sparkles,
  GraduationCap,
  Library,
  Shield,
  Bell,
  Check,
  Save,
} from "lucide-react";
import {
  saveTeacherSettings,
  removeCompletedImages,
  runRetentionCleanup,
} from "@/actions/settings";
import {
  settingsSchema,
  defaultFoScale,
  defaultControlScale,
  type TeacherSettings,
  gradingSettings,
} from "@/lib/settings/schema";
import { AutonomyEditor } from "@/components/grading/autonomy-editor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScaleEditor } from "@/components/settings/scale-editor";
import {
  selectClass,
  secondaryButtonClass,
} from "@/components/worksheets/labels";
import { cn } from "@/lib/utils";

const sections = [
  {
    id: "profile",
    label: "Профиль и школа",
    description: "Как вы представлены в рабочем пространстве.",
    icon: UserRound,
  },
  {
    id: "grading",
    label: "Правила проверки",
    description: "Ваши правила сравнения ответов и ручного контроля.",
    icon: SlidersHorizontal,
  },
  {
    id: "ai",
    label: "Режим ИИ",
    description: "Предпочтительный уровень участия учителя.",
    icon: Sparkles,
  },
  {
    id: "assessment",
    label: "Оценивание",
    description: "Перевод результата в оценку для дневника.",
    icon: GraduationCap,
  },
  {
    id: "library",
    label: "Библиотека",
    description: "Что сохранять для следующих уроков.",
    icon: Library,
  },
  {
    id: "privacy",
    label: "Приватность и данные",
    description: "Срок хранения оригиналов ученических работ.",
    icon: Shield,
  },
  {
    id: "notifications",
    label: "Уведомления",
    description: "События, которые заслуживают вашего внимания.",
    icon: Bell,
  },
] as const;

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block text-xs font-normal leading-5 text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-5 border-b py-4 last:border-0">
      <div>
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        aria-labelledby={id}
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
function TextList({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
}) {
  const [text, setText] = useState(value.join(", "));
  return (
    <Input
      aria-label={label}
      value={text}
      maxLength={2400}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
      placeholder="Через запятую"
    />
  );
}

export function SettingsForm({
  initial,
  initialRevision,
  classes,
}: {
  initial: TeacherSettings;
  initialRevision: number;
  classes: { name: string }[];
}) {
  const [section, setSection] =
    useState<(typeof sections)[number]["id"]>("profile");
  const [revision, setRevision] = useState(initialRevision);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<TeacherSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: initial,
  });
  const values = useWatch({
    control,
    compute: (value: TeacherSettings) => value,
  });
  const current = sections.find((s) => s.id === section)!;
  const change = <K extends FieldPath<TeacherSettings>>(
    key: K,
    value: FieldPathValue<TeacherSettings, K>,
  ) => {
    setError("");
    setNotice("");
    if (
      [
        "auto_confirm",
        "auto_confirm_ai",
        "auto_confirm_open",
        "confidence_threshold",
        "fraction_equivalence",
        "ignore_case",
        "typo_tolerance",
        "rounding_digits",
      ].includes(key)
    )
      setValue("ai_preset", "custom", { shouldDirty: true });
    if (key === "auto_confirm" && value === false) {
      setValue("auto_confirm_ai", false, { shouldDirty: true });
      setValue("auto_confirm_open", false, { shouldDirty: true });
    }
    if (key === "auto_confirm_ai" && value === false)
      setValue("auto_confirm_open", false, { shouldDirty: true });
    setValue(key, value, { shouldDirty: true, shouldValidate: true });
  };
  const toggle = (
    key:
      | "auto_confirm"
      | "auto_confirm_ai"
      | "fraction_equivalence"
      | "ignore_case"
      | "typo_tolerance"
      | "library_worksheets"
      | "library_ai"
      | "notify_completed"
      | "notify_review",
    label: string,
    hint: string,
  ) => (
    <Toggle
      label={label}
      hint={hint}
      value={values[key]}
      onChange={(value) => change(key, value)}
      disabled={isSubmitting}
    />
  );
  async function submit(document: TeacherSettings) {
    setError("");
    setNotice("");
    try {
      const result = await saveTeacherSettings({ document, revision });
      if ("error" in result) {
        setError(result.error ?? "Не удалось сохранить настройки.");
        return;
      }
      setRevision(result.revision);
      reset(document);
      setNotice("Настройки сохранены.");
    } catch {
      setError("Не удалось связаться с сервером. Изменения остаются в форме.");
    }
  }
  async function cleanup(all: boolean) {
    setDeleteBusy(true);
    setError("");
    setNotice("");
    try {
      const result = all
        ? await removeCompletedImages("delete-completed-images")
        : await runRetentionCleanup();
      if ("error" in result)
        setError(result.error ?? "Не удалось выполнить очистку.");
      else {
        setNotice(
          `Удалено изображений: ${result.removed}. Результаты проверок сохранены.`,
        );
        setDeleting(false);
        setConfirmation(false);
      }
    } catch {
      setError(
        "Очистка не подтверждена сервером. Повторите запуск; результаты останутся сохранены.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="mb-3 text-xs text-muted-foreground">
          Ваше рабочее пространство
        </p>
        <h1 className="studio-title">Настройки</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Профиль, правила проверки и рабочие предпочтения.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[210px_minmax(0,1fr)]">
        <nav
          aria-label="Разделы настроек"
          className="flex gap-1 overflow-x-auto rounded-md border bg-card p-2 xl:sticky xl:top-6 xl:flex-col xl:overflow-visible"
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSection(id);
                setDeleting(false);
                setConfirmation(false);
              }}
              aria-current={section === id ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                section === id
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <form
          onChange={() => {
            setError("");
            setNotice("");
          }}
          noValidate
          onSubmit={handleSubmit(submit, () =>
            setError("Проверьте отмеченные поля и шкалы в разделах настроек."),
          )}
          className="min-w-0 rounded-lg border bg-card"
          aria-busy={isSubmitting}
        >
          <div className="border-b px-5 py-5 sm:px-7">
            <h2 className="text-lg font-semibold">{current.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {current.description}
            </p>
          </div>
          <fieldset
            disabled={isSubmitting}
            className="min-w-0 space-y-6 p-5 sm:p-7"
          >
            <legend className="sr-only">{current.label}</legend>
            {section === "profile" && (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Имя и фамилия">
                    <Input
                      {...register("full_name")}
                      autoComplete="name"
                      maxLength={80}
                      aria-invalid={!!errors.full_name}
                    />
                    {errors.full_name && (
                      <span className="text-xs text-destructive">
                        {errors.full_name.message}
                      </span>
                    )}
                  </Field>
                  <Field label="Название школы">
                    <Input
                      {...register("school_name")}
                      autoComplete="organization"
                      maxLength={160}
                      placeholder="Например, школа № 12"
                    />
                  </Field>
                </div>
                <Field label="Предметы" hint="До 30 предметов, через запятую.">
                  <Controller
                    control={control}
                    name="subjects"
                    render={({ field }) => (
                      <TextList {...field} label="Предметы" />
                    )}
                  />
                </Field>
                <Field
                  label="Классы, в которых вы преподаёте"
                  hint="Названия через запятую. Это информация профиля, а не создание классов."
                >
                  <Controller
                    control={control}
                    name="teaching_classes"
                    render={({ field }) => (
                      <TextList
                        {...field}
                        label="Классы, в которых вы преподаёте"
                      />
                    )}
                  />
                </Field>
                <p className="text-xs leading-5 text-muted-foreground">
                  {classes.length > 0 &&
                    `В приложении: ${classes.map((c) => c.name).join(", ")}. `}
                  <Link
                    href="/classes"
                    className="text-primary underline underline-offset-4"
                  >
                    Управлять классами
                  </Link>
                </p>
                <Field
                  label="Язык интерфейса"
                  hint="Казахский и английский появятся после подготовки переводов."
                >
                  <select {...register("ui_language")} className={selectClass}>
                    <option value="ru">Русский</option>
                    <option disabled>Қазақша — скоро</option>
                    <option disabled>English — скоро</option>
                  </select>
                </Field>
                <Field
                  label="Подпись"
                  hint="Личная подпись профиля. Пока не добавляется в PDF и ответы ученикам."
                >
                  <textarea
                    {...register("signature")}
                    rows={3}
                    maxLength={500}
                    placeholder="Например, С уважением, Елена Петровна"
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </Field>
              </>
            )}
            {section === "grading" && (
              <>
                <div>
                  {toggle(
                    "auto_confirm",
                    "Автоматически подтверждать уверенные ответы",
                    "Варианты выбора, числа и совпадения с эталоном. Можно отключить и проверять каждый ответ вручную.",
                  )}
                  {toggle(
                    "auto_confirm_ai",
                    "Автоподтверждение оценок ИИ",
                    "Разрешить оценки ИИ для коротких ответов выше заданного порога. Развёрнутые ответы разрешаются отдельно в разделе «Режим ИИ». Пустые, нечитаемые и неоднозначные ответы всегда идут учителю.",
                  )}
                </div>
                <Field
                  label="Порог уверенности"
                  hint="От 0,50 до 1,00. Ответы с confidence ниже порога направляются учителю. Порог включителен."
                >
                  <Input
                    {...register("confidence_threshold", {
                      valueAsNumber: true,
                    })}
                    type="number"
                    min={0.5}
                    max={1}
                    step={0.01}
                    className="max-w-40"
                  />
                </Field>
                <div>
                  {toggle(
                    "fraction_equivalence",
                    "Считать 0.5 и 1/2 одинаковыми",
                    "Сравнивать математически равные числовые ответы. Если выключено, дроби в числовых заданиях требуют ручной проверки.",
                  )}
                  {toggle(
                    "ignore_case",
                    "Игнорировать регистр",
                    "Для коротких ответов. В химических формулах и некоторых языках регистр может менять смысл.",
                  )}
                  {toggle(
                    "typo_tolerance",
                    "Допускать небольшие опечатки",
                    "Одна вставка, пропуск или замена буквы в коротком ответе от 4 до 120 символов. Числа и символы не исправляются.",
                  )}
                </div>
                <Field
                  label="Округление чисел"
                  hint="Округлить распознанное число и эталон перед сравнением. Допуск конкретного задания сохраняется."
                >
                  <select
                    className={selectClass}
                    value={
                      values.rounding_digits === null
                        ? "none"
                        : String(values.rounding_digits)
                    }
                    onChange={(e) =>
                      change(
                        "rounding_digits",
                        e.target.value === "none"
                          ? null
                          : Number(e.target.value),
                      )
                    }
                  >
                    <option value="none">Без дополнительного округления</option>
                    {Array.from({ length: 9 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? "До целого" : `До ${i} знаков после запятой`}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="rounded-md bg-secondary/60 p-4 text-xs leading-5 text-muted-foreground">
                  Правила фиксируются при первом запуске проверки. Изменения не
                  затрагивают уже начатые работы. До завершения проверки учитель
                  может изменить любую предварительную оценку в списке всех
                  ответов.
                </p>
              </>
            )}
            {section === "ai" && (
              <>
                <p className="text-sm leading-6 text-muted-foreground">
                  Значение по умолчанию для новых проверок. Перед запуском
                  каждой проверки режим нужно подтвердить; начатые работы
                  сохраняют свои правила.
                </p>
                <AutonomyEditor
                  value={{ ...gradingSettings(values), mode: values.ai_preset }}
                  disabled={isSubmitting}
                  onChange={(rules) => {
                    change("auto_confirm", rules.auto_confirm);
                    change("auto_confirm_ai", rules.auto_confirm_ai);
                    change("auto_confirm_open", rules.auto_confirm_open);
                    change("confidence_threshold", rules.confidence_threshold);
                    change("fraction_equivalence", rules.fraction_equivalence);
                    change("ignore_case", rules.ignore_case);
                    change("typo_tolerance", rules.typo_tolerance);
                    change("rounding_digits", rules.rounding_digits);
                    change("ai_preset", rules.mode);
                  }}
                />
              </>
            )}
            {section === "assessment" && (
              <>
                <p className="text-xs leading-5 text-muted-foreground">
                  Каждая строка задаёт включительную нижнюю границу. Начните с
                  0%, далее — по возрастанию. Оценка не отправляется в дневник
                  автоматически. Для отдельной работы шкалу можно изменить на
                  странице результатов.
                </p>
                <div className="grid gap-6 2xl:grid-cols-2">
                  <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">
                        ФО · 0–10 баллов
                      </h3>
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => change("fo_scale", defaultFoScale)}
                      >
                        По умолчанию
                      </button>
                    </div>
                    <ScaleEditor
                      label="ФО"
                      value={values.fo_scale}
                      onChange={(value) => change("fo_scale", value)}
                      maximum={10}
                    />
                  </section>
                  <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">
                        Контрольные · СОР / СОЧ
                      </h3>
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() =>
                          change("control_scale", defaultControlScale)
                        }
                      >
                        По умолчанию
                      </button>
                    </div>
                    <ScaleEditor
                      label="Контрольные"
                      value={values.control_scale}
                      onChange={(value) => change("control_scale", value)}
                      maximum={5}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      Пример по умолчанию: 0% → 2, 40% → 3, 65% → 4, 85% → 5.
                      Укажите свои границы.
                    </p>
                  </section>
                </div>
              </>
            )}
            {section === "library" && (
              <>
                <div>
                  {toggle(
                    "library_worksheets",
                    "Добавлять созданные worksheet в библиотеку",
                    "После явного сохранения работы учителем. Генерация сама по себе не сохраняет черновик.",
                  )}
                  {toggle(
                    "library_ai",
                    "Сохранять принятые задания ИИ",
                    "Добавлять задания с отметкой генерации после сохранения worksheet. Непринятые предложения ИИ не сохраняются.",
                  )}
                </div>
                <Field label="Папка по умолчанию">
                  <Input {...register("default_folder")} maxLength={80} />
                </Field>
                <Field
                  label="Теги по умолчанию"
                  hint="До 30 тегов, через запятую. Применяются к новым материалам."
                >
                  <Controller
                    control={control}
                    name="default_tags"
                    render={({ field }) => (
                      <TextList {...field} label="Теги по умолчанию" />
                    )}
                  />
                </Field>
                <Link
                  href="/library"
                  className="inline-block text-sm text-primary underline underline-offset-4"
                >
                  Открыть библиотеку
                </Link>
              </>
            )}
            {section === "privacy" && (
              <>
                <Field
                  label="Срок хранения изображений"
                  hint="Отсчитывается от завершения проверки. Незавершённые работы не удаляются."
                >
                  <select
                    className={selectClass}
                    value={
                      values.retention_days === null
                        ? "never"
                        : String(values.retention_days)
                    }
                    onChange={(e) =>
                      change(
                        "retention_days",
                        e.target.value === "never"
                          ? null
                          : (Number(e.target.value) as 7 | 30 | 90),
                      )
                    }
                  >
                    <option value="never">
                      Никогда не удалять автоматически
                    </option>
                    <option value="7">7 дней</option>
                    <option value="30">30 дней</option>
                    <option value="90">90 дней</option>
                  </select>
                </Field>
                <p className="text-xs leading-5 text-muted-foreground">
                  Очистка выполняется при следующем открытии сайта и по кнопке.
                  Сохраните срок перед запуском. Фоновая очистка при закрытом
                  сайте пока не настроена.
                </p>
                <button
                  type="button"
                  disabled={deleteBusy || isDirty}
                  className={secondaryButtonClass}
                  onClick={() => cleanup(false)}
                >
                  Очистить по сохранённому сроку
                </button>
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-sm font-semibold">
                    Оставить только результаты
                  </h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Удалить оригиналы всех ваших завершённых проверок. Баллы,
                    ответы и аналитика останутся. Изображения восстановить
                    нельзя; фрагменты оригиналов больше не будут доступны.
                  </p>
                  {!deleting ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-md border px-4 text-sm text-destructive"
                      onClick={() => {
                        setConfirmation(false);
                        setDeleting(true);
                      }}
                    >
                      Удалить все изображения завершённых проверок
                    </button>
                  ) : (
                    <div className="space-y-4 rounded-md border border-destructive/40 p-4">
                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={confirmation}
                          onChange={(e) => setConfirmation(e.target.checked)}
                          className="mt-1 accent-primary"
                          disabled={deleteBusy}
                        />
                        Понимаю, что оригиналы завершённых проверок будут
                        удалены навсегда.
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!confirmation || deleteBusy}
                          onClick={() => cleanup(true)}
                          className="min-h-11 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground disabled:opacity-40"
                        >
                          {deleteBusy ? "Удаляем…" : "Подтвердить удаление"}
                        </button>
                        <button
                          type="button"
                          disabled={deleteBusy}
                          onClick={() => {
                            setDeleting(false);
                            setConfirmation(false);
                          }}
                          className={secondaryButtonClass}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {section === "notifications" && (
              <>
                <div>
                  {toggle(
                    "notify_completed",
                    "Проверка завершена",
                    "Уведомлять после завершения проверки и подтверждения всех спорных ответов.",
                  )}
                  {toggle(
                    "notify_review",
                    "Ответы требуют внимания",
                    "Уведомлять, когда распознавание закончено и есть ответы для ручного решения.",
                  )}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Уведомления доступны по колокольчику в хедере.
                  Email-уведомления появятся позже.
                </p>
              </>
            )}
          </fieldset>
          {(error || Object.keys(errors).length > 0) && (
            <div
              role="alert"
              className="mx-5 mb-5 rounded-md border border-destructive/30 p-4 text-sm text-destructive sm:mx-7"
            >
              <p>{error || "Проверьте поля настроек."}</p>
              {Object.entries(errors).map(([key, value]) => (
                <p key={key} className="mt-1 text-xs">
                  {value?.message ||
                    "Проверьте значения и порядок порогов шкалы."}
                </p>
              ))}
            </div>
          )}
          {notice && (
            <p
              role="status"
              className="mx-5 mb-5 flex items-start gap-2 text-sm text-primary sm:mx-7"
            >
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t bg-secondary/20 px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground">
              {isDirty
                ? "Есть несохранённые изменения"
                : "Настройки вашего аккаунта"}
            </p>
            <Button
              type="submit"
              disabled={isSubmitting || !isDirty || deleteBusy}
            >
              <Save className="size-4" aria-hidden="true" />
              {isSubmitting ? "Сохраняем…" : "Сохранить настройки"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
