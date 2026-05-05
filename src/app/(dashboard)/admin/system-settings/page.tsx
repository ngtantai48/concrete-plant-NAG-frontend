import SystemSettingsForm from "@/components/features/admin/system-settings/SystemSettingsForm";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "SystemSettingsPage" });
  return {
    title: t("title"),
  };
}

export default function SystemSettingsPage() {
  return (
    <div className="p-6 min-h-screen bg-gray-50/50">
      <SystemSettingsForm />
    </div>
  );
}
