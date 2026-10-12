import { useTranslations } from "use-intl";

export default function DashboardNotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
      <h1 className="text-2xl font-semibold">{t("Title")}</h1>
      <p className="text-muted-foreground">{t("Description")}</p>
    </div>
  );
}
