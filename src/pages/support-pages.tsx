import { useTranslation } from "react-i18next";

import { ModuleStatusPage } from "@/components/app";

export function SupportPage() {
  const { t } = useTranslation();
  return (
    <ModuleStatusPage
      title={t("compatibility.support.title")}
      description={t("compatibility.support.description")}
      statusTitle={t("compatibility.support.status")}
      statusDescription={t("compatibility.support.statusDescription")}
      links={[
        {
          label: t("compatibility.support.account"),
          description: t("compatibility.support.accountDescription"),
          path: "/account",
        },
      ]}
      notes={[
        t("compatibility.support.noteTickets"),
        t("compatibility.support.noteErrors"),
      ]}
    />
  );
}

export function FeedbackPage() {
  const { t } = useTranslation();
  return (
    <ModuleStatusPage
      title={t("compatibility.feedback.title")}
      description={t("compatibility.feedback.description")}
      statusTitle={t("compatibility.feedback.status")}
      statusDescription={t("compatibility.feedback.statusDescription")}
      notes={[
        t("compatibility.feedback.noteForm"),
        t("compatibility.feedback.noteRoute"),
      ]}
    />
  );
}
