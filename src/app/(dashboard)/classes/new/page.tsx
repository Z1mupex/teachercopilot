import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClassForm } from "@/components/classes/class-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Новый класс — Teacher Copilot" };

export default async function NewClassPage() {
  await requireUser("/classes/new");
  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/classes"
        className="inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Мои классы
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Новый класс</h1>
        <p className="mt-3 text-muted-foreground">
          Добавьте учебную группу в ваше рабочее пространство.
        </p>
      </div>
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Информация о классе</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassForm />
        </CardContent>
      </Card>
    </div>
  );
}
