import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  Edit3Icon,
  KeyRoundIcon,
  PlusIcon,
  SaveIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppBarChart,
  type AppBarChartDatum,
  type AppBarChartSeries,
  AppDialog,
  AppDisclosureSection,
  AppExpandablePanel,
  AppFieldGrid,
  AppListToolbar,
  AppSearchBar,
  AppSectionCard,
  DataTableBody,
  DataTableHeader,
  DataTableShell,
  EmptyState,
  FormField,
  StatusBadge,
} from "@/components/app";
import { useAuthSession } from "@/features/auth/app-session";
import {
  listAdminLlmSecrets,
  listAdminModelProfiles,
  upsertAdminLlmSecret,
  type AdminLlmSecret,
  type AdminModelProfile,
} from "@/lib/api/api-client";
import { normalizeAppError } from "@/lib/app/api-errors";
import { notify } from "@/lib/app/notifications";
import { useApiResource } from "@/lib/app/use-api-resource";
import { i18n, normalizeLanguage } from "@/lib/i18n/i18n";

import {
  AdminAccessDenied,
  SystemPageShell,
  emptySecret,
  systemStatusLabel,
  type LoadState,
} from "./shared";

type SecretForm = typeof emptySecret;

type SecretInsight = {
  secretRef: string;
  health: "healthy" | "missing" | "inactive" | "unused";
  provider: string;
  referencedModels: AdminModelProfile[];
};

export function SystemSecretManagementPage() {
  const { t } = useTranslation();
  const { accessToken, currentSessionId, currentUser } = useAuthSession();
  const [query, setQuery] = React.useState("");
  const [editingSecret, setEditingSecret] = React.useState<SecretForm | null>(
    null,
  );
  const [secretDialogMode, setSecretDialogMode] = React.useState<
    "create" | "edit"
  >("create");
  const [expandedSecretRefs, setExpandedSecretRefs] = React.useState<
    Set<string>
  >(() => new Set());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [state, setState] = React.useState<LoadState>("idle");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const isAdmin = currentUser?.role === "admin";

  const loadSecrets = React.useCallback(async () => {
    if (!accessToken || !isAdmin) {
      return {
        secrets: [] as AdminLlmSecret[],
        models: [] as AdminModelProfile[],
      };
    }
    const [secretResult, modelResult] = await Promise.all([
      listAdminLlmSecrets(accessToken),
      listAdminModelProfiles(accessToken),
    ]);
    return {
      secrets: secretResult.secrets,
      models: modelResult.profiles,
    };
  }, [accessToken, isAdmin]);
  const secretResource = useApiResource({
    enabled: Boolean(accessToken && isAdmin),
    cacheKey: ["system-secrets", currentSessionId],
    load: loadSecrets,
    errorMessage: t("system.secrets.loadFailed"),
  });
  const secrets = React.useMemo(
    () => secretResource.data?.secrets ?? [],
    [secretResource.data?.secrets],
  );
  const models = React.useMemo(
    () => secretResource.data?.models ?? [],
    [secretResource.data?.models],
  );

  const secretInsights = React.useMemo(
    () => buildSecretInsights(secrets, models),
    [models, secrets],
  );

  const filteredSecrets = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return secrets;
    return secrets.filter((secret) =>
      `${secret.secret_ref} ${secret.status} ${secretInsights.bySecretRef.get(secret.secret_ref)?.provider ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [query, secretInsights.bySecretRef, secrets]);

  const metrics = React.useMemo(
    () => [
      {
        label: t("system.secrets.metrics.refs"),
        value: String(secrets.length),
        detail: t("system.secrets.metrics.saved", {
          count: secrets.filter((secret) => secret.has_secret).length,
        }),
        icon: KeyRoundIcon,
        tone: "blue" as const,
      },
      {
        label: t("system.secrets.metrics.healthy"),
        value: String(
          secrets.filter((secret) => secret.status === "active").length,
        ),
        detail: t("system.secrets.metrics.healthyDetail"),
        icon: CheckIcon,
        tone: "green" as const,
      },
      {
        label: t("system.secrets.metrics.missing"),
        value: String(secrets.filter((secret) => !secret.has_secret).length),
        detail: t("system.secrets.metrics.missingDetail"),
        icon: KeyRoundIcon,
        tone: "amber" as const,
      },
      {
        label: t("system.secrets.metrics.attention"),
        value: String(secretInsights.riskySecrets),
        detail: t("system.secrets.metrics.attentionDetail"),
        icon: AlertTriangleIcon,
        tone: "indigo" as const,
      },
    ],
    [secretInsights.riskySecrets, secrets, t],
  );

  function openCreateDialog() {
    setSecretDialogMode("create");
    setEditingSecret({ ...emptySecret, secret: "" });
    setDialogOpen(true);
  }

  function openEditDialog(secret: AdminLlmSecret) {
    setSecretDialogMode("edit");
    setEditingSecret({
      secret_ref: secret.secret_ref,
      secret: "",
      status: secret.status,
      metadata_json: secret.metadata_json ?? {},
    });
    setDialogOpen(true);
  }

  function toggleExpandedSecret(secretRef: string) {
    setExpandedSecretRefs((current) => {
      const next = new Set(current);
      if (next.has(secretRef)) {
        next.delete(secretRef);
      } else {
        next.add(secretRef);
      }
      return next;
    });
  }

  async function saveSecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !editingSecret) return;
    setState("saving");
    setError("");
    try {
      const result = await upsertAdminLlmSecret(accessToken, editingSecret);
      secretResource.setData((current) => ({
        secrets: [
          result.secret,
          ...(current?.secrets ?? []).filter(
            (item) => item.secret_ref !== result.secret.secret_ref,
          ),
        ],
        models: current?.models ?? [],
      }));
      setMessage(
        t("system.secrets.savedMessage", { ref: result.secret.secret_ref }),
      );
      notify.success({
        title: t("system.secrets.saved"),
        description: result.secret.secret_ref,
      });
      setDialogOpen(false);
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: t("system.secrets.saveFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.secrets.saveFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <SystemPageShell
      title={t("system.secrets.title")}
      subtitle={t("system.secrets.subtitle")}
      metrics={metrics}
      state={state}
      resourceState={secretResource.state}
      resourceError={secretResource.error}
      message={message}
      error={error}
      onRefresh={() => void secretResource.reload()}
    >
      <AppSectionCard
        title={t("system.secrets.healthTitle")}
        description={t("system.secrets.healthDescription")}
        icon={KeyRoundIcon}
      >
        <AppBarChart
          data={secretInsights.chartData}
          series={secretInsights.chartSeries}
          height={180}
          valueFormatter={formatCompactNumber}
          emptyTitle={t("system.secrets.healthEmpty")}
          emptyDescription={t("system.secrets.healthEmptyDescription")}
        />
      </AppSectionCard>

      <AppSectionCard
        title={t("system.secrets.listTitle")}
        description={t("system.secrets.listDescription")}
        icon={KeyRoundIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("system.secrets.search")}
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              {t("system.secrets.add")}
            </Button>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredSecrets.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">
                    {t("system.secrets.columns.ref")}
                  </th>
                  <th className="hidden w-28 px-4 py-3 @2xl/table:table-cell">
                    {t("system.secrets.columns.provider")}
                  </th>
                  <th className="hidden w-24 px-4 py-3 @3xl/table:table-cell">
                    {t("system.secrets.columns.references")}
                  </th>
                  <th className="hidden w-28 px-4 py-3 @xl/table:table-cell">
                    {t("system.secrets.columns.saved")}
                  </th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">
                    {t("system.secrets.columns.status")}
                  </th>
                  <th className="w-16 px-3 py-3 text-right sm:w-24 sm:px-4">
                    {t("system.secrets.columns.actions")}
                  </th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredSecrets.map((secret) => {
                  const expanded = expandedSecretRefs.has(secret.secret_ref);
                  const insight = secretInsights.bySecretRef.get(
                    secret.secret_ref,
                  );
                  return (
                    <React.Fragment key={secret.secret_ref}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              expanded
                                ? t("system.secrets.collapse")
                                : t("system.secrets.expand")
                            }
                            onClick={() =>
                              toggleExpandedSecret(secret.secret_ref)
                            }
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">
                            {secret.secret_ref}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {t("system.secrets.hidden")}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @2xl/table:table-cell">
                          {insight?.provider ?? "-"}
                        </td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          {t("system.secrets.modelCount", {
                            count: insight?.referencedModels.length ?? 0,
                          })}
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          <StatusBadge
                            status={secret.has_secret ? "saved" : "missing"}
                            label={systemStatusLabel(
                              secret.has_secret ? "saved" : "missing",
                            )}
                          />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge
                            status={secret.status}
                            label={systemStatusLabel(secret.status)}
                          />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(secret)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">
                                {t("system.secrets.edit")}
                              </span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <AppExpandablePanel>
                              <SecretDetail insight={insight} secret={secret} />
                            </AppExpandablePanel>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </DataTableBody>
            </DataTableShell>
          ) : null}
          {filteredSecrets.length === 0 ? (
            <EmptyState
              title={t("system.secrets.empty")}
              detail={t("system.secrets.emptyDescription")}
            />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={
          secretDialogMode === "create"
            ? t("system.secrets.addTitle")
            : t("system.secrets.editTitle")
        }
        description={
          secretDialogMode === "create"
            ? t("system.secrets.addDescription")
            : t("system.secrets.editDescription")
        }
        onOpenChange={setDialogOpen}
      >
        {editingSecret ? (
          <SecretForm
            mode={secretDialogMode}
            secret={editingSecret}
            state={state}
            onChange={setEditingSecret}
            onSubmit={saveSecret}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  );
}

function SecretDetail({
  insight,
  secret,
}: {
  insight?: SecretInsight;
  secret: AdminLlmSecret;
}) {
  const { t } = useTranslation();
  const metadata =
    secret.metadata_json && Object.keys(secret.metadata_json).length > 0
      ? JSON.stringify(secret.metadata_json)
      : t("system.secrets.noMetadata");

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <SecretInfoItem
          label="Health"
          value={insight?.health ?? "unknown"}
          detail={healthDetail(insight)}
        />
        <SecretInfoItem
          label="Provider"
          value={insight?.provider ?? "-"}
          detail="derived from model base url"
        />
        <SecretInfoItem
          label="Models"
          value={String(insight?.referencedModels.length ?? 0)}
          detail="referencing this key"
        />
        <SecretInfoItem
          label="Call Health"
          value={t("system.secrets.notConnected")}
          detail={t("system.secrets.aggregationNeeded")}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">
            {t("system.secrets.security")}
          </div>
          <p className="mt-1 text-sm leading-6">
            {t("system.secrets.securityDescription")}
          </p>
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">
            Secret value
          </div>
          <div className="mt-1 text-sm">
            {secret.has_secret
              ? t("system.secrets.secretSaved")
              : t("system.secrets.secretUnsaved")}
          </div>
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">
            Metadata
          </div>
          <div className="mt-1 truncate text-sm">{metadata}</div>
        </div>
      </div>
      <div className="grid gap-2">
        <div className="text-sm font-medium">
          {t("system.secrets.referencedModels")}
        </div>
        {insight?.referencedModels.map((model) => (
          <div
            key={model.id}
            className="grid gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="font-medium">{model.display_name}</div>
              <div className="text-muted-foreground">
                {model.upstream_model_name} /{" "}
                {model.upstream_base_url ?? t("system.secrets.baseUrlMissing")}
              </div>
            </div>
            <StatusBadge
              status={
                model.archived_at
                  ? "archived"
                  : model.enabled
                    ? "enabled"
                    : "disabled"
              }
              label={systemStatusLabel(
                model.archived_at
                  ? "archived"
                  : model.enabled
                    ? "enabled"
                    : "disabled",
              )}
            />
          </div>
        ))}
        {insight?.referencedModels.length ? null : (
          <EmptyState
            title={t("system.secrets.noReferences")}
            detail={t("system.secrets.noReferencesDescription")}
          />
        )}
      </div>
    </div>
  );
}

function buildSecretInsights(
  secrets: AdminLlmSecret[],
  models: AdminModelProfile[],
) {
  const bySecretRef = new Map<string, SecretInsight>();
  for (const secret of secrets) {
    const referencedModels = models.filter(
      (model) => model.upstream_api_key_ref === secret.secret_ref,
    );
    const activeReferencedModels = referencedModels.filter(
      (model) => model.enabled && !model.archived_at,
    );
    const health: SecretInsight["health"] = !secret.has_secret
      ? "missing"
      : secret.status !== "active"
        ? "inactive"
        : activeReferencedModels.length === 0
          ? "unused"
          : "healthy";

    bySecretRef.set(secret.secret_ref, {
      health,
      provider: inferProvider(referencedModels),
      referencedModels,
      secretRef: secret.secret_ref,
    });
  }

  const healthy = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "healthy",
  ).length;
  const missing = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "missing",
  ).length;
  const inactive = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "inactive",
  ).length;
  const unused = Array.from(bySecretRef.values()).filter(
    (item) => item.health === "unused",
  ).length;
  const chartData: AppBarChartDatum[] = [
    {
      label: i18n.t("system.secrets.chart.key"),
      healthy,
      missing,
      inactive,
      unused,
    },
  ];
  const chartSeries: AppBarChartSeries[] = [
    {
      key: "healthy",
      label: i18n.t("system.secrets.chart.healthy"),
      color: "var(--chart-1)",
    },
    {
      key: "missing",
      label: i18n.t("system.secrets.chart.missing"),
      color: "var(--chart-2)",
    },
    {
      key: "inactive",
      label: i18n.t("system.secrets.chart.inactive"),
      color: "var(--chart-3)",
    },
    {
      key: "unused",
      label: i18n.t("system.secrets.chart.unused"),
      color: "var(--chart-4)",
    },
  ];

  return {
    bySecretRef,
    chartData,
    chartSeries,
    riskySecrets: missing + inactive + unused,
  };
}

function inferProvider(models: AdminModelProfile[]) {
  const baseUrl = models.find(
    (model) => model.upstream_base_url,
  )?.upstream_base_url;
  if (!baseUrl) return "-";
  try {
    return new URL(baseUrl).hostname.replace(/^api\./, "");
  } catch {
    return baseUrl;
  }
}

function healthDetail(insight?: SecretInsight) {
  switch (insight?.health) {
    case "healthy":
      return i18n.t("system.secrets.health.healthy");
    case "inactive":
      return i18n.t("system.secrets.health.inactive");
    case "missing":
      return i18n.t("system.secrets.health.missing");
    case "unused":
      return i18n.t("system.secrets.health.unused");
    default:
      return i18n.t("system.secrets.health.unknown");
  }
}

function SecretInfoItem({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-medium">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
      notation: "compact",
      maximumFractionDigits: value >= 100 ? 1 : 2,
    },
  ).format(value);
}

function SecretForm({
  mode,
  secret,
  state,
  onChange,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  secret: SecretForm;
  state: LoadState;
  onChange: React.Dispatch<React.SetStateAction<SecretForm | null>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <AppDisclosureSection
        title={t("system.secrets.form.security")}
        description={t("system.secrets.form.securityDescription")}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {t("system.secrets.form.guidance")}
        </p>
      </AppDisclosureSection>
      <AppDisclosureSection title={t("system.secrets.form.content")}>
        <AppFieldGrid columns={1}>
          <FormField label={t("system.secrets.form.ref")}>
            <Input
              value={secret.secret_ref}
              disabled={mode === "edit"}
              required
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, secret_ref: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.secrets.form.value")}>
            <Input
              type="password"
              value={secret.secret}
              required={mode === "create"}
              placeholder={t("system.secrets.form.placeholder")}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, secret: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.secrets.form.status")}>
            <Input
              value={secret.status}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, status: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("system.secrets.form.cancel")}
        </Button>
        <Button type="submit" disabled={state !== "idle"}>
          <SaveIcon />
          {t("system.secrets.form.save")}
        </Button>
      </div>
    </form>
  );
}
