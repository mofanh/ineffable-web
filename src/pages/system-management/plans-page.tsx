import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon,
  ChevronDownIcon,
  CheckIcon,
  Edit3Icon,
  PackageIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ToggleField,
} from "@/components/app";
import { useAuthSession } from "@/features/auth/app-session";
import {
  createAdminPlan,
  deleteAdminPlan,
  listAdminModelProfiles,
  listAdminPlanInsights,
  listAdminPlanModelAccess,
  listAdminPlans,
  upsertAdminPlanModelAccess,
  updateAdminPlan,
  type AdminModelProfile,
  type AdminPlan,
  type AdminPlanInsight,
  type AdminPlanPayload,
  type AdminPlanModelAccess,
} from "@/lib/api/api-client";
import { normalizeAppError } from "@/lib/app/api-errors";
import { confirm } from "@/lib/app/confirm";
import { notify } from "@/lib/app/notifications";
import {
  invalidateApiResourceCache,
  useApiResource,
} from "@/lib/app/use-api-resource";
import { i18n, normalizeLanguage } from "@/lib/i18n/i18n";

import {
  AdminAccessDenied,
  SystemPageShell,
  emptyPlan,
  modelAccessFor,
  normalizeAccess,
  numberOrNull,
  systemStatusLabel,
  type LoadState,
} from "./shared";

type PlanInsight = {
  planId: string;
  assignedUsers: number;
  currentCredits: number;
  storageBytes: number;
  creditPressurePercent: number;
  storagePressurePercent?: number;
};

export function SystemPlanManagementPage() {
  const { t } = useTranslation();
  const { accessToken, currentSessionId, currentUser } = useAuthSession();
  const [selectedPlanId, setSelectedPlanId] = React.useState("free");
  const [accessRowsByPlanId, setAccessRowsByPlanId] = React.useState<
    Record<string, AdminPlanModelAccess[]>
  >({});
  const [query, setQuery] = React.useState("");
  const [expandedPlanIds, setExpandedPlanIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [editingPlan, setEditingPlan] = React.useState<AdminPlanPayload | null>(
    null,
  );
  const [editingPlanId, setEditingPlanId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [state, setState] = React.useState<LoadState>("idle");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const isAdmin = currentUser?.role === "admin";

  const loadPlans = React.useCallback(async () => {
    if (!accessToken || !isAdmin) {
      return {
        models: [] as AdminModelProfile[],
        plans: [] as AdminPlan[],
        insights: [] as AdminPlanInsight[],
      };
    }
    const [modelResult, planResult, insightResult] = await Promise.all([
      listAdminModelProfiles(accessToken),
      listAdminPlans(accessToken),
      listAdminPlanInsights(accessToken),
    ]);
    return {
      models: modelResult.profiles,
      plans: planResult.plans,
      insights: insightResult.insights,
    };
  }, [accessToken, isAdmin]);
  const planResource = useApiResource({
    enabled: Boolean(accessToken && isAdmin),
    cacheKey: ["system-plans", currentSessionId],
    load: loadPlans,
    errorMessage: t("system.plans.loadFailed"),
  });
  const models = React.useMemo(
    () => planResource.data?.models ?? [],
    [planResource.data?.models],
  );
  const plans = React.useMemo(
    () => planResource.data?.plans ?? [],
    [planResource.data?.plans],
  );
  const insights = React.useMemo(
    () => planResource.data?.insights ?? [],
    [planResource.data?.insights],
  );

  React.useEffect(() => {
    if (!plans.length) return;
    setSelectedPlanId((current) =>
      plans.some((plan) => plan.id === current && !plan.archived_at)
        ? current
        : (plans.find((plan) => !plan.archived_at)?.id ?? "free"),
    );
  }, [plans]);

  React.useEffect(() => {
    if (!accessToken || !isAdmin || !selectedPlanId) {
      return;
    }

    let cancelled = false;
    const planId = selectedPlanId;
    void listAdminPlanModelAccess(accessToken, selectedPlanId)
      .then((result) => {
        if (!cancelled) {
          setAccessRowsByPlanId((current) => ({
            ...current,
            [planId]: result.access.map(normalizeAccess),
          }));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          const appError = normalizeAppError(loadError, {
            fallbackMessage: t("system.plans.loadFailed"),
          });
          setError(appError.message);
          notify.error({
            title: t("system.plans.accessLoadFailedTitle"),
            description: appError.message,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, isAdmin, selectedPlanId, t]);

  const filteredPlans = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return plans;
    return plans.filter((plan) =>
      `${plan.id} ${plan.name} ${plan.display_name}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [plans, query]);

  const activeModels = React.useMemo(
    () => models.filter((model) => !model.archived_at),
    [models],
  );

  const planInsights = React.useMemo(
    () => buildPlanInsights({ insights, plans }),
    [insights, plans],
  );

  const metrics = React.useMemo(
    () => [
      {
        label: t("system.plans.metrics.plans"),
        value: String(plans.length),
        detail: t("system.plans.metrics.enabled", {
          count: plans.filter((plan) => plan.enabled && !plan.archived_at)
            .length,
        }),
        icon: PackageIcon,
        tone: "blue" as const,
      },
      {
        label: t("system.plans.metrics.models"),
        value: String(models.length),
        detail: t("system.plans.metrics.configurable"),
        icon: BotIcon,
        tone: "green" as const,
      },
      {
        label: t("system.plans.metrics.selected"),
        value: selectedPlanId || "-",
        detail: t("system.plans.metrics.selectedDetail"),
        icon: CheckIcon,
        tone: "amber" as const,
      },
      {
        label: t("system.plans.metrics.users"),
        value: formatCompactNumber(planInsights.assignedUsers),
        detail: t("system.plans.metrics.usersDetail"),
        icon: PackageIcon,
        tone: "indigo" as const,
      },
    ],
    [models.length, planInsights.assignedUsers, plans, selectedPlanId, t],
  );

  function openCreateDialog() {
    setEditingPlan({ ...emptyPlan });
    setEditingPlanId(null);
    setDialogOpen(true);
  }

  function openEditDialog(plan: AdminPlan) {
    setEditingPlan({
      name: plan.name,
      display_name: plan.display_name,
      monthly_credit_limit: plan.monthly_credit_limit ?? null,
      workspace_storage_limit_bytes: plan.workspace_storage_limit_bytes ?? null,
      max_workspace_count: plan.max_workspace_count ?? null,
      max_members_per_workspace: plan.max_members_per_workspace ?? null,
      workspace_object_count_limit: plan.workspace_object_count_limit ?? null,
      max_file_size_bytes: plan.max_file_size_bytes ?? null,
      max_active_cloud_sandboxes: plan.max_active_cloud_sandboxes ?? null,
      agent_evolution_policy: {
        ...plan.agent_evolution_policy,
        runtime_lab_allowed_component_kinds: [
          ...plan.agent_evolution_policy.runtime_lab_allowed_component_kinds,
        ],
      },
      capability_exposure_policy: {
        ...plan.capability_exposure_policy,
        allowed_modes: [...plan.capability_exposure_policy.allowed_modes],
        allowed_families: [...plan.capability_exposure_policy.allowed_families],
      },
      enabled: plan.enabled,
    });
    setEditingPlanId(plan.id);
    setSelectedPlanId(plan.id);
    setDialogOpen(true);
  }

  function toggleExpandedPlan(planId: string) {
    setSelectedPlanId(planId);
    setExpandedPlanIds((current) => {
      return current.has(planId) ? new Set() : new Set([planId]);
    });
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !editingPlan) return;
    setState("saving");
    setError("");
    try {
      const result = editingPlanId
        ? await updateAdminPlan(accessToken, editingPlanId, editingPlan)
        : await createAdminPlan(accessToken, editingPlan);
      planResource.setData((current) => ({
        models: current?.models ?? [],
        plans: [
          result.plan,
          ...(current?.plans ?? []).filter(
            (item) => item.id !== result.plan.id,
          ),
        ],
        insights: current?.insights ?? [],
      }));
      invalidateApiResourceCache(["system-users", currentSessionId]);
      setSelectedPlanId(result.plan.id);
      setMessage(
        t("system.plans.savedMessage", { name: result.plan.display_name }),
      );
      notify.success({
        title: t("system.plans.saved"),
        description: result.plan.display_name,
      });
      setDialogOpen(false);
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: t("system.plans.saveFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.plans.saveFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  async function deletePlan(plan: AdminPlan) {
    if (!accessToken || plan.id === "free" || plan.archived_at) return;
    const confirmed = await confirm({
      title: t("system.plans.deleteTitle", { name: plan.display_name }),
      description: t("system.plans.deleteDescription"),
      confirmLabel: t("system.plans.deleteConfirm"),
      variant: "destructive",
    });
    if (!confirmed) {
      return;
    }
    setState("saving");
    setError("");
    try {
      const result = await deleteAdminPlan(accessToken, plan.id);
      planResource.setData((current) => ({
        models: current?.models ?? [],
        plans: [
          result.plan,
          ...(current?.plans ?? []).filter(
            (item) => item.id !== result.plan.id,
          ),
        ],
        insights: current?.insights ?? [],
      }));
      invalidateApiResourceCache(["system-users", currentSessionId]);
      setSelectedPlanId((current) => (current === plan.id ? "free" : current));
      setMessage(
        t("system.plans.deletedMessage", { name: result.plan.display_name }),
      );
      notify.success({
        title: t("system.plans.deleted"),
        description: result.plan.display_name,
      });
    } catch (deleteError) {
      const appError = normalizeAppError(deleteError, {
        fallbackMessage: t("system.plans.deleteFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.plans.deleteFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  async function saveAccess(modelId: string, next: AdminPlanModelAccess) {
    if (!accessToken) return;
    const payload = normalizeAccess(next);
    setState("saving");
    setError("");
    try {
      const result = await upsertAdminPlanModelAccess(accessToken, payload);
      const normalized = normalizeAccess(result.access);
      setAccessRowsByPlanId((current) => ({
        ...current,
        [payload.plan_id]: [
          normalized,
          ...(current[payload.plan_id] ?? []).filter(
            (item) => item.model_profile_id !== modelId,
          ),
        ],
      }));
      setMessage(
        t("system.plans.accessSavedMessage", {
          plan: payload.plan_id,
          model: modelId,
        }),
      );
      notify.success({
        title: t("system.plans.accessSaved"),
        description: `${payload.plan_id} / ${modelId}`,
      });
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: t("system.plans.saveFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.plans.accessSaveFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <SystemPageShell
      title={t("system.plans.title")}
      subtitle={t("system.plans.subtitle")}
      metrics={metrics}
      state={state}
      resourceState={planResource.state}
      resourceError={planResource.error}
      message={message}
      error={error}
      onRefresh={() => void planResource.reload()}
    >
      <AppSectionCard
        title={t("system.plans.pressureTitle")}
        description={t("system.plans.pressureDescription")}
        icon={PackageIcon}
      >
        <AppBarChart
          data={planInsights.chartData}
          series={planInsights.chartSeries}
          height={220}
          valueFormatter={formatCompactNumber}
          emptyTitle={t("system.plans.pressureEmpty")}
          emptyDescription={t("system.plans.pressureEmptyDescription")}
        />
      </AppSectionCard>

      <AppSectionCard
        title={t("system.plans.listTitle")}
        description={t("system.plans.listDescription")}
        icon={PackageIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("system.plans.search")}
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              {t("system.plans.add")}
            </Button>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredPlans.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">
                    {t("system.plans.columns.plan")}
                  </th>
                  <th className="hidden w-32 px-4 py-3 @xl/table:table-cell">
                    {t("system.plans.columns.monthlyLimit")}
                  </th>
                  <th className="hidden w-32 px-4 py-3 @3xl/table:table-cell">
                    {t("system.plans.columns.workspace")}
                  </th>
                  <th className="hidden w-24 px-4 py-3 @4xl/table:table-cell">
                    {t("system.plans.columns.access")}
                  </th>
                  <th className="hidden w-32 px-4 py-3 @5xl/table:table-cell">
                    {t("system.plans.columns.pressure")}
                  </th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">
                    {t("system.plans.columns.status")}
                  </th>
                  <th className="w-24 px-3 py-3 text-right sm:w-40 sm:px-4">
                    {t("system.plans.columns.actions")}
                  </th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredPlans.map((plan) => {
                  const expanded = expandedPlanIds.has(plan.id);
                  const accessRows = accessRowsByPlanId[plan.id];
                  const insight = planInsights.byPlanId.get(plan.id);
                  const accessCount = accessRows
                    ? accessRows.filter((item) => item.visible).length
                    : "-";
                  return (
                    <React.Fragment key={plan.id}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              expanded
                                ? t("system.plans.collapse")
                                : t("system.plans.expand")
                            }
                            disabled={Boolean(plan.archived_at)}
                            onClick={() => toggleExpandedPlan(plan.id)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">
                            {plan.display_name}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {plan.id} / {plan.name}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          {plan.monthly_credit_limit ??
                            t("system.plans.unlimited")}
                        </td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          <div>
                            {formatBytesLimit(
                              plan.workspace_storage_limit_bytes,
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("system.plans.workspaceSummary", {
                              spaces: formatLimitCount(
                                plan.max_workspace_count,
                              ),
                              members: formatLimitCount(
                                plan.max_members_per_workspace,
                              ),
                            })}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("system.plans.objectSummary", {
                              objects: formatLimitCount(
                                plan.workspace_object_count_limit,
                              ),
                              fileSize: formatBytesLimit(
                                plan.max_file_size_bytes,
                              ),
                            })}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @4xl/table:table-cell">
                          {accessCount}
                        </td>
                        <td className="hidden px-4 py-3 @5xl/table:table-cell">
                          <div>
                            {t("system.plans.usersCount", {
                              count: formatCompactNumber(
                                insight?.assignedUsers ?? 0,
                              ),
                            })}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("system.plans.creditsCount", {
                              count: formatCompactNumber(
                                insight?.currentCredits ?? 0,
                              ),
                            })}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("system.plans.storageUsed", {
                              value: formatBytesLimit(
                                insight?.storageBytes ?? 0,
                              ),
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge
                            status={
                              plan.archived_at
                                ? "archived"
                                : plan.enabled
                                  ? "enabled"
                                  : "disabled"
                            }
                            label={systemStatusLabel(
                              plan.archived_at
                                ? "archived"
                                : plan.enabled
                                  ? "enabled"
                                  : "disabled",
                            )}
                          />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end gap-1 sm:gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(plan)}
                              disabled={Boolean(plan.archived_at)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">
                                {t("system.plans.edit")}
                              </span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void deletePlan(plan)}
                              disabled={
                                state !== "idle" ||
                                plan.id === "free" ||
                                Boolean(plan.archived_at)
                              }
                            >
                              <Trash2Icon />
                              <span className="hidden sm:inline">
                                {t("system.plans.delete")}
                              </span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <AppExpandablePanel>
                              <PlanAccessPanel
                                activeModels={activeModels}
                                accessRows={accessRows}
                                insight={insight}
                                plan={plan}
                                planId={plan.id}
                                state={state}
                                onSaveAccess={saveAccess}
                              />
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
          {filteredPlans.length === 0 ? (
            <EmptyState
              title={t("system.plans.empty")}
              detail={t("system.plans.emptyDescription")}
            />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={
          editingPlanId
            ? t("system.plans.editTitle")
            : t("system.plans.addTitle")
        }
        description={t("system.plans.dialogDescription")}
        onOpenChange={setDialogOpen}
      >
        {editingPlan ? (
          <PlanForm
            plan={editingPlan}
            state={state}
            onChange={setEditingPlan}
            onSubmit={savePlan}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  );
}

function buildPlanInsights({
  insights,
  plans,
}: {
  insights: AdminPlanInsight[];
  plans: AdminPlan[];
}) {
  const byPlanId = new Map<string, PlanInsight>();
  const aggregateByPlanId = new Map(
    insights.map((insight) => [insight.plan_id, insight]),
  );

  for (const plan of plans) {
    const aggregate = aggregateByPlanId.get(plan.id);
    const assignedUsers = aggregate?.assigned_users ?? 0;
    const currentCredits = aggregate?.current_credits ?? 0;
    const storageBytes = aggregate?.storage_bytes ?? 0;
    const aggregateCreditLimit =
      plan.monthly_credit_limit == null
        ? null
        : plan.monthly_credit_limit * Math.max(assignedUsers, 1);
    const aggregateStorageLimit =
      plan.workspace_storage_limit_bytes == null
        ? null
        : plan.workspace_storage_limit_bytes *
          Math.max(aggregate?.workspace_count ?? 0, 1);

    byPlanId.set(plan.id, {
      planId: plan.id,
      assignedUsers,
      currentCredits,
      storageBytes,
      creditPressurePercent:
        aggregateCreditLimit && aggregateCreditLimit > 0
          ? Math.round((currentCredits / aggregateCreditLimit) * 100)
          : 0,
      storagePressurePercent:
        aggregateStorageLimit && aggregateStorageLimit > 0
          ? Math.round((storageBytes / aggregateStorageLimit) * 100)
          : undefined,
    });
  }

  const chartData: AppBarChartDatum[] = plans
    .filter((plan) => !plan.archived_at)
    .slice(0, 8)
    .map((plan) => {
      const insight = byPlanId.get(plan.id);
      return {
        label: plan.display_name,
        users: insight?.assignedUsers ?? 0,
        credits: insight?.currentCredits ?? 0,
        storage_gb: (insight?.storageBytes ?? 0) / 1024 / 1024 / 1024,
      };
    });
  const chartSeries: AppBarChartSeries[] = [
    {
      key: "users",
      label: i18n.t("system.plans.chart.users"),
      color: "var(--chart-1)",
    },
    {
      key: "credits",
      label: i18n.t("system.plans.chart.credits"),
      color: "var(--chart-2)",
    },
    {
      key: "storage_gb",
      label: i18n.t("system.plans.chart.storage"),
      color: "var(--chart-3)",
    },
  ];

  return {
    assignedUsers: Array.from(byPlanId.values()).reduce(
      (total, item) => total + item.assignedUsers,
      0,
    ),
    byPlanId,
    chartData,
    chartSeries,
  };
}

function PlanAccessPanel({
  activeModels,
  accessRows,
  insight,
  plan,
  planId,
  state,
  onSaveAccess,
}: {
  activeModels: AdminModelProfile[];
  accessRows?: AdminPlanModelAccess[];
  insight?: PlanInsight;
  plan: AdminPlan;
  planId: string;
  state: LoadState;
  onSaveAccess: (modelId: string, next: AdminPlanModelAccess) => Promise<void>;
}) {
  const { t } = useTranslation();
  if (!accessRows) {
    return (
      <EmptyState
        title={t("system.plans.access.loading")}
        detail={t("system.plans.access.loadingDescription")}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-3">
        <InsightItem
          label={t("system.plans.access.assignedUsers")}
          value={formatCompactNumber(insight?.assignedUsers ?? 0)}
          detail={t("system.plans.access.activeAssignments")}
        />
        <InsightItem
          label={t("system.plans.access.monthlyCredits")}
          value={formatCompactNumber(insight?.currentCredits ?? 0)}
          detail={
            plan.monthly_credit_limit
              ? t("system.plans.access.aggregatePercent", {
                  percent: formatCompactNumber(
                    insight?.creditPressurePercent ?? 0,
                  ),
                })
              : t("system.plans.access.noCreditLimit")
          }
        />
        <InsightItem
          label="Workspace Storage"
          value={formatBytesLimit(insight?.storageBytes ?? 0)}
          detail={
            insight?.storagePressurePercent == null
              ? t("system.plans.access.noStorageLimit")
              : t("system.plans.access.aggregatePercent", {
                  percent: formatCompactNumber(insight.storagePressurePercent),
                })
          }
        />
      </div>
      <div className="text-sm text-muted-foreground">
        {t("system.plans.access.notice", { plan: planId })}
      </div>
      {activeModels.map((model) => {
        const existing = accessRows.find(
          (item) => item.model_profile_id === model.id,
        );
        const access = normalizeAccess(
          existing ?? modelAccessFor(planId, model.id),
        );

        return (
          <div
            key={model.id}
            className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_auto_auto_auto]"
          >
            <div>
              <div className="font-medium">{model.display_name}</div>
              <div className="text-sm text-muted-foreground">
                {model.id} / {model.upstream_model_name}
              </div>
            </div>
            <ToggleField
              label={t("system.plans.access.visible")}
              checked={access.visible}
              onCheckedChange={(checked) =>
                void onSaveAccess(model.id, {
                  ...access,
                  visible: checked,
                  usable: checked ? access.usable : false,
                })
              }
            />
            <ToggleField
              label={t("system.plans.access.usable")}
              checked={access.usable}
              disabled={!access.visible}
              onCheckedChange={(checked) =>
                void onSaveAccess(model.id, { ...access, usable: checked })
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void onSaveAccess(model.id, access)}
              disabled={state !== "idle"}
            >
              <CheckIcon />
              {t("system.plans.access.grant")}
            </Button>
          </div>
        );
      })}
      {activeModels.length === 0 ? (
        <EmptyState
          title={t("system.plans.access.noModels")}
          detail={t("system.plans.access.noModelsDescription")}
        />
      ) : null}
    </div>
  );
}

function InsightItem({
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

function PlanForm({
  plan,
  state,
  onChange,
  onSubmit,
  onCancel,
}: {
  plan: AdminPlanPayload;
  state: LoadState;
  onChange: React.Dispatch<React.SetStateAction<AdminPlanPayload | null>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const policy = plan.agent_evolution_policy;
  const capabilityPolicy = plan.capability_exposure_policy;

  function updatePolicy(
    patch: Partial<AdminPlanPayload["agent_evolution_policy"]>,
  ) {
    onChange((current) =>
      current
        ? {
            ...current,
            agent_evolution_policy: {
              ...current.agent_evolution_policy,
              ...patch,
            },
          }
        : current,
    );
  }

  function toggleRuntimeLabComponentKind(kind: string, checked: boolean) {
    const kinds = checked
      ? Array.from(
          new Set([...policy.runtime_lab_allowed_component_kinds, kind]),
        )
      : policy.runtime_lab_allowed_component_kinds.filter(
          (current) => current !== kind,
        );
    updatePolicy({ runtime_lab_allowed_component_kinds: kinds });
  }

  function updateCapabilityPolicy(
    patch: Partial<AdminPlanPayload["capability_exposure_policy"]>,
  ) {
    onChange((current) =>
      current
        ? {
            ...current,
            capability_exposure_policy: {
              ...current.capability_exposure_policy,
              ...patch,
            },
          }
        : current,
    );
  }

  function toggleCapabilityMode(
    mode: AdminPlanPayload["capability_exposure_policy"]["allowed_modes"][number],
    checked: boolean,
  ) {
    const allowedModes = checked
      ? Array.from(new Set([...capabilityPolicy.allowed_modes, mode]))
      : capabilityPolicy.allowed_modes.filter((item) => item !== mode);
    if (allowedModes.length === 0) return;
    const fallbackDefault = allowedModes.find((item) => item !== "custom");
    if (!fallbackDefault) return;
    updateCapabilityPolicy({
      allowed_modes: allowedModes,
      default_mode: allowedModes.includes(capabilityPolicy.default_mode)
        ? capabilityPolicy.default_mode
        : fallbackDefault,
    });
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <AppDisclosureSection title={t("system.plans.form.basic")}>
        <AppFieldGrid columns={1}>
          <FormField label={t("system.plans.form.internalName")}>
            <Input
              value={plan.name}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.plans.form.displayName")}>
            <Input
              value={plan.display_name}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, display_name: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <ToggleField
            label={t("system.plans.form.enable")}
            checked={plan.enabled}
            onCheckedChange={(checked) =>
              onChange((current) =>
                current ? { ...current, enabled: checked } : current,
              )
            }
          />
        </AppFieldGrid>
      </AppDisclosureSection>
      <AppDisclosureSection
        title={t("system.plans.form.capabilityExposure")}
        description={t("system.plans.form.capabilityExposureDescription")}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["smart", "clean", "full", "custom"] as const).map((mode) => (
              <ToggleField
                key={mode}
                label={t(`chat.composer.capabilityMode.${mode}`)}
                checked={capabilityPolicy.allowed_modes.includes(mode)}
                onCheckedChange={(checked) =>
                  toggleCapabilityMode(mode, checked)
                }
              />
            ))}
          </div>
          <FormField label={t("system.plans.form.defaultCapabilityMode")}>
            <Select
              value={capabilityPolicy.default_mode}
              onValueChange={(value) =>
                updateCapabilityPolicy({
                  default_mode: value as typeof capabilityPolicy.default_mode,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capabilityPolicy.allowed_modes
                  .filter((mode) => mode !== "custom")
                  .map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`chat.composer.capabilityMode.${mode}`)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label={t("system.plans.form.allowedCapabilityFamilies")}
            description={t(
              "system.plans.form.allowedCapabilityFamiliesDescription",
            )}
          >
            <Input
              value={capabilityPolicy.allowed_families.join(", ")}
              placeholder="workspace, sandbox, web.research"
              onChange={(event) =>
                updateCapabilityPolicy({
                  allowed_families: Array.from(
                    new Set(
                      event.target.value
                        .split(",")
                        .map((value) => value.trim().toLowerCase())
                        .filter(Boolean),
                    ),
                  ),
                })
              }
            />
          </FormField>
          <AppFieldGrid columns={2}>
            <PolicyNumberField
              label={t("system.plans.form.maxExposedTools")}
              value={capabilityPolicy.max_exposed_tools}
              onChange={(value) =>
                updateCapabilityPolicy({ max_exposed_tools: value })
              }
            />
            <PolicyNumberField
              label={t("system.plans.form.maxSchemaBytes")}
              value={capabilityPolicy.max_schema_bytes}
              onChange={(value) =>
                updateCapabilityPolicy({ max_schema_bytes: value })
              }
            />
            <PolicyNumberField
              label={t("system.plans.form.maxPrefetchedTools")}
              value={capabilityPolicy.max_prefetched_tools}
              onChange={(value) =>
                updateCapabilityPolicy({ max_prefetched_tools: value })
              }
            />
            <PolicyNumberField
              label={t("system.plans.form.maxDynamicTools")}
              value={capabilityPolicy.max_dynamic_tools}
              onChange={(value) =>
                updateCapabilityPolicy({ max_dynamic_tools: value })
              }
            />
            <PolicyNumberField
              label={t("system.plans.form.maxDiscoveryResults")}
              value={capabilityPolicy.max_discovery_results}
              onChange={(value) =>
                updateCapabilityPolicy({ max_discovery_results: value })
              }
            />
          </AppFieldGrid>
        </div>
      </AppDisclosureSection>
      <AppDisclosureSection
        title={t("system.plans.form.agentEvolution")}
        description={t("system.plans.form.agentEvolutionDescription")}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="grid gap-3">
            <ToggleField
              label={t("system.plans.form.definitionRecomposition")}
              checked={policy.allow_definition_recomposition}
              onCheckedChange={(checked) =>
                updatePolicy({
                  allow_definition_recomposition: checked,
                  ...(!checked
                    ? {
                        allow_artifact_nodes: false,
                        allow_runtime_lab: false,
                      }
                    : {}),
                })
              }
            />
            <ToggleField
              label={t("system.plans.form.artifactNodes")}
              checked={policy.allow_artifact_nodes}
              disabled={!policy.allow_definition_recomposition}
              onCheckedChange={(checked) =>
                updatePolicy({
                  allow_artifact_nodes: checked,
                  ...(!checked ? { allow_runtime_lab: false } : {}),
                })
              }
            />
            <ToggleField
              label={t("system.plans.form.runtimeLab")}
              checked={policy.allow_runtime_lab}
              disabled={!policy.allow_artifact_nodes}
              onCheckedChange={(checked) =>
                updatePolicy({
                  allow_runtime_lab: checked,
                  ...(checked
                    ? {
                        runtime_lab_ttl_seconds:
                          policy.runtime_lab_ttl_seconds ?? 3600,
                        max_runtime_labs: policy.max_runtime_labs ?? 1,
                        max_runtime_lab_components: Math.max(
                          policy.max_runtime_lab_components,
                          1,
                        ),
                        runtime_lab_allowed_component_kinds:
                          policy.runtime_lab_allowed_component_kinds.length > 0
                            ? policy.runtime_lab_allowed_component_kinds
                            : ["node"],
                      }
                    : {}),
                })
              }
            />
          </div>

          {policy.allow_definition_recomposition ? (
            <AppFieldGrid columns={2}>
              <PolicyNumberField
                label={t("system.plans.form.maxDefinitions")}
                value={policy.max_definitions}
                onChange={(value) => updatePolicy({ max_definitions: value })}
              />
              <PolicyNumberField
                label={t("system.plans.form.maxGenerationDepth")}
                value={policy.max_generation_depth}
                onChange={(value) =>
                  updatePolicy({ max_generation_depth: value })
                }
              />
              <PolicyNumberField
                label={t("system.plans.form.maxCandidates")}
                value={policy.max_candidates_per_evaluation}
                onChange={(value) =>
                  updatePolicy({ max_candidates_per_evaluation: value })
                }
              />
              <PolicyNumberField
                label={t("system.plans.form.maxParallelEvaluations")}
                value={policy.max_parallel_evaluations}
                onChange={(value) =>
                  updatePolicy({ max_parallel_evaluations: value })
                }
              />
              <PolicyNumberField
                label={t("system.plans.form.maxEvaluationTokens")}
                value={policy.max_evaluation_tokens}
                onChange={(value) =>
                  updatePolicy({ max_evaluation_tokens: value })
                }
              />
              <PolicyNumberField
                label={t("system.plans.form.maxEvaluationCredits")}
                value={policy.max_evaluation_cost_credits}
                step="0.1"
                onChange={(value) =>
                  updatePolicy({ max_evaluation_cost_credits: value })
                }
              />
              <PolicyNumberField
                label={t("system.plans.form.maxEvaluationWallMs")}
                value={policy.max_evaluation_wall_ms}
                onChange={(value) =>
                  updatePolicy({ max_evaluation_wall_ms: value })
                }
              />
            </AppFieldGrid>
          ) : null}

          {policy.allow_runtime_lab ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="text-sm font-medium">
                {t("system.plans.form.runtimeLabLimits")}
              </div>
              <AppFieldGrid columns={2}>
                <PolicyOptionalNumberField
                  label={t("system.plans.form.cloudSandboxes")}
                  description={t(
                    "system.plans.form.cloudSandboxesDescription",
                  )}
                  value={plan.max_active_cloud_sandboxes}
                  onChange={(value) =>
                    onChange((current) =>
                      current
                        ? { ...current, max_active_cloud_sandboxes: value }
                        : current,
                    )
                  }
                />
                <PolicyNumberField
                  label={t("system.plans.form.runtimeLabTtl")}
                  value={policy.runtime_lab_ttl_seconds ?? 0}
                  onChange={(value) =>
                    updatePolicy({ runtime_lab_ttl_seconds: value })
                  }
                />
                <PolicyNumberField
                  label={t("system.plans.form.maxRuntimeLabs")}
                  value={policy.max_runtime_labs ?? 0}
                  onChange={(value) =>
                    updatePolicy({ max_runtime_labs: value })
                  }
                />
                <PolicyNumberField
                  label={t("system.plans.form.maxRuntimeLabComponents")}
                  value={policy.max_runtime_lab_components}
                  onChange={(value) =>
                    updatePolicy({ max_runtime_lab_components: value })
                  }
                />
                <PolicyNumberField
                  label={t("system.plans.form.revocationGrace")}
                  value={policy.runtime_lab_revocation_grace_seconds}
                  onChange={(value) =>
                    updatePolicy({
                      runtime_lab_revocation_grace_seconds: value,
                    })
                  }
                />
              </AppFieldGrid>
              <div>
                <div className="mb-2 text-sm font-medium">
                  {t("system.plans.form.allowedComponentKinds")}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      kind: "node",
                      label: t("system.plans.form.componentKinds.node"),
                    },
                    {
                      kind: "capability_provider",
                      label: t(
                        "system.plans.form.componentKinds.capability_provider",
                      ),
                    },
                    {
                      kind: "environment",
                      label: t("system.plans.form.componentKinds.environment"),
                    },
                    {
                      kind: "interface_adapter",
                      label: t(
                        "system.plans.form.componentKinds.interface_adapter",
                      ),
                    },
                  ].map(({ kind, label }) => (
                    <ToggleField
                      key={kind}
                      label={label}
                      checked={policy.runtime_lab_allowed_component_kinds.includes(
                        kind,
                      )}
                      onCheckedChange={(checked) =>
                        toggleRuntimeLabComponentKind(kind, checked)
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </AppDisclosureSection>
      <AppDisclosureSection
        title={t("system.plans.form.credits")}
        description={t("system.plans.form.creditsDescription")}
      >
        <AppFieldGrid columns={1}>
          <FormField label={t("system.plans.form.monthlyLimit")}>
            <Input
              type="number"
              value={plan.monthly_credit_limit ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        monthly_credit_limit: numberOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>
      <AppDisclosureSection
        title={t("system.plans.form.workspace")}
        description={t("system.plans.form.workspaceDescription")}
      >
        <AppFieldGrid columns={1}>
          <FormField label={t("system.plans.form.storageGb")}>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={bytesToGigabytesInput(plan.workspace_storage_limit_bytes)}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        workspace_storage_limit_bytes: gigabytesToBytesOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.plans.form.workspaceCount")}>
            <Input
              type="number"
              min={0}
              step={1}
              value={plan.max_workspace_count ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_workspace_count: numberOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.plans.form.members")}>
            <Input
              type="number"
              min={0}
              step={1}
              value={plan.max_members_per_workspace ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_members_per_workspace: numberOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.plans.form.objects")}>
            <Input
              type="number"
              min={0}
              step={1}
              value={plan.workspace_object_count_limit ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        workspace_object_count_limit: numberOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.plans.form.fileMb")}>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={bytesToMegabytesInput(plan.max_file_size_bytes)}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_file_size_bytes: megabytesToBytesOrNull(
                          event.target.value,
                        ),
                      }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("system.plans.form.cancel")}
        </Button>
        <Button type="submit" disabled={state !== "idle"}>
          <SaveIcon />
          {t("system.plans.form.save")}
        </Button>
      </div>
    </form>
  );
}

function PolicyNumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number | string;
  onChange: (value: number) => void;
}) {
  return (
    <FormField label={label}>
      <Input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </FormField>
  );
}

function PolicyOptionalNumberField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value?: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <FormField label={label} description={description}>
      <Input
        type="number"
        min={0}
        step={1}
        value={value ?? ""}
        onChange={(event) => onChange(numberOrNull(event.target.value))}
      />
    </FormField>
  );
}

function bytesToGigabytesInput(value?: number | null) {
  if (value == null) return "";
  return String(Number((value / 1024 / 1024 / 1024).toFixed(2)));
}

function gigabytesToBytesOrNull(value: string) {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  return Math.round(parsed * 1024 * 1024 * 1024);
}

function bytesToMegabytesInput(value?: number | null) {
  if (value == null) return "";
  return String(Number((value / 1024 / 1024).toFixed(2)));
}

function megabytesToBytesOrNull(value: string) {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  return Math.round(parsed * 1024 * 1024);
}

function formatBytesLimit(value?: number | null) {
  if (value == null) return i18n.t("system.plans.unlimited");
  if (value >= 1024 * 1024 * 1024) {
    return `${formatCompactNumber(value / 1024 / 1024 / 1024)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${formatCompactNumber(value / 1024 / 1024)} MB`;
  }
  return `${formatCompactNumber(value)} B`;
}

function formatLimitCount(value?: number | null) {
  return value == null
    ? i18n.t("system.plans.unlimited")
    : formatCompactNumber(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
      maximumFractionDigits: value >= 10 ? 1 : 2,
    },
  ).format(value);
}
