import { useTranslation } from "react-i18next";

import { ModuleStatusPage } from "@/components/app";

export function DocsCenterPage() {
  const { t } = useTranslation();
  return (
    <ModuleStatusPage
      title={t("compatibility.docs.title")}
      description={t("compatibility.docs.description")}
      statusTitle={t("compatibility.docs.status")}
      statusDescription={t("compatibility.docs.statusDescription")}
      links={[
        {
          label: t("compatibility.docs.automation"),
          description: t("compatibility.docs.automationDescription"),
          path: "/automation",
        },
        {
          label: t("compatibility.docs.models"),
          description: t("compatibility.docs.modelsDescription"),
          path: "/models",
        },
        {
          label: t("compatibility.docs.account"),
          description: t("compatibility.docs.accountDescription"),
          path: "/account",
        },
      ]}
      notes={[
        t("compatibility.docs.noteFeatures"),
        t("compatibility.docs.noteWorkspace"),
      ]}
    />
  );
}
