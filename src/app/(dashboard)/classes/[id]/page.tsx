import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, GraduationCap, Users } from "lucide-react";
import { ClassForm } from "@/components/classes/class-form";
import { DeleteClassDialog } from "@/components/classes/delete-class-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getClass } from "@/lib/classes/repository";
import { classIdSchema } from "@/lib/validation/classes";

export const metadata: Metadata = { title: "Класс — Teacher Copilot" };

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("/classes");
  const { id } = await params;
  const parsed = classIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  const teacherClass = await getClass(user.id, parsed.data);
  if (!teacherClass) notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/classes"
        className="inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Мои классы
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <p className="mb-2 text-sm font-medium text-primary">
            Информация о классе
          </p>
          <h1 className="break-words text-3xl font-bold tracking-tight">
            {teacherClass.name}
          </h1>
        </div>
        <DeleteClassDialog id={teacherClass.id} name={teacherClass.name} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: GraduationCap,
            label: "Параллель",
            value:
              teacherClass.grade === null
                ? "Не указана"
                : `${teacherClass.grade} класс`,
          },
          {
            icon: BookOpen,
            label: "Предмет",
            value: teacherClass.subject ?? "Не указан",
          },
          {
            icon: Users,
            label: "Учеников",
            value: teacherClass.student_count ?? "Не указано",
          },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4 text-primary" aria-hidden="true" />
              {label}
            </div>
            <p className="mt-3 break-words font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Редактировать класс</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassForm teacherClass={teacherClass} />
        </CardContent>
      </Card>
    </div>
  );
}
