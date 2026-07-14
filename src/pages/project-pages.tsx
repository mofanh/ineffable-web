import { useTranslation } from "react-i18next";

import { ModuleStatusPage } from "@/components/app";

export function ProjectsHomePage() {
  const { t } = useTranslation();
  return (
    <ModuleStatusPage
      title={t("compatibility.projects.title")}
      description={t("compatibility.projects.description")}
      statusTitle={t("compatibility.projects.status")}
      statusDescription={t("compatibility.projects.statusDescription")}
      links={[
        {
          label: t("compatibility.projects.automation"),
          description: t("compatibility.projects.automationDescription"),
          path: "/automation",
        },
        {
          label: t("compatibility.projects.models"),
          description: t("compatibility.projects.modelsDescription"),
          path: "/models",
        },
      ]}
      notes={[
        t("compatibility.projects.noteWorkspace"),
        t("compatibility.projects.noteBackend"),
      ]}
    />
  );
}
