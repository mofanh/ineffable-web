import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIcon,
  BarChart3Icon,
  BotIcon,
  ChevronDownIcon,
  Edit3Icon,
  PlusIcon,
  SaveIcon,
  TrendingUpIcon,
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
  AppDialog,
  AppDialogFooter,
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
  createAdminModelProfile,
  deleteAdminModelProfile,
  listAdminModelMonthlyUsage,
  listAdminModelProfiles,
  listAdminModelUsageTimeseries,
  updateAdminModelProfile,
  type AdminModelMonthlyUsage,
  type AdminModelProfile,
  type AdminModelProfilePayload,
  type AdminUsageRange,
} from "@/lib/api/api-client";
import { normalizeAppError } from "@/lib/app/api-errors";
import { confirm } from "@/lib/app/confirm";
import { notify } from "@/lib/app/notifications";
import {
  invalidateApiResourceCache,
  useApiResource,
} from "@/lib/app/use-api-resource";
import { getCurrentLocale, i18n, normalizeLanguage } from "@/lib/i18n/i18n";
import {
  buildModelUsageChart,
  UsageTimeseriesPanel,
  type ModelUsageMetric,
} from "@/features/admin-usage/usage-timeseries";

import {
  AdminAccessDenied,
  SystemPageShell,
  emptyModel,
  isRawApiKey,
  numberOrNull,
  systemStatusLabel,
  textOrNull,
  type LoadState,
} from "./shared";

type ModelStatusFilter = "active" | "enabled" | "disabled" | "archived" | "all";
type ModelCapabilityFilter = "tool" | "reasoning" | "vision" | "json";
type ModelSortKey =
  | "sort_order"
  | "name"
  | "current_credits"
  | "current_requests"
  | "range_credits";

const capabilityFilters: Array<{
  value: ModelCapabilityFilter;
  label: string;
}> = [
  { value: "tool", label: i18n.t("system.models.capabilities.tool") },
  { value: "reasoning", label: i18n.t("system.models.capabilities.reasoning") },
  { value: "vision", label: i18n.t("system.models.capabilities.vision") },
  { value: "json", label: i18n.t("system.models.capabilities.json") },
];

export function AdminLlmSettingsPage() {
  return <SystemModelManagementPage />;
}

export function SystemModelManagementPage() {
  const { t } = useTranslation();
  const { accessToken, currentSessionId, currentUser } = useAuthSession();
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<ModelStatusFilter>("active");
  const [selectedCapabilities, setSelectedCapabilities] = React.useState<
    ModelCapabilityFilter[]
  >([]);
  const [sortKey, setSortKey] = React.useState<ModelSortKey>("sort_order");
  const [usageRange, setUsageRange] = React.useState<AdminUsageRange>("30d");
  const [usageMetric, setUsageMetric] =
    React.useState<ModelUsageMetric>("credits");
  const [editingModel, setEditingModel] =
    React.useState<AdminModelProfilePayload | null>(null);
  const [editingModelId, setEditingModelId] = React.useState<string | null>(
    null,
  );
  const [expandedModelIds, setExpandedModelIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [state, setState] = React.useState<LoadState>("idle");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const isAdmin = currentUser?.role === "admin";

  const loadModels = React.useCallback(async () => {
    if (!accessToken || !isAdmin) {
      return {
        profiles: [] as AdminModelProfile[],
        usage: [] as AdminModelMonthlyUsage[],
      };
    }
    const [modelResult, usageResult] = await Promise.all([
      listAdminModelProfiles(accessToken),
      listAdminModelMonthlyUsage(accessToken, 6),
    ]);
    return {
      profiles: modelResult.profiles,
      usage: usageResult.usage,
    };
  }, [accessToken, isAdmin]);
  const modelResource = useApiResource({
    enabled: Boolean(accessToken && isAdmin),
    cacheKey: ["system-models", currentSessionId],
    load: loadModels,
    errorMessage: t("system.models.loadFailed"),
  });
  const models = React.useMemo(
    () => modelResource.data?.profiles ?? [],
    [modelResource.data?.profiles],
  );
  const usageRows = React.useMemo(
    () => modelResource.data?.usage ?? [],
    [modelResource.data?.usage],
  );

  const loadUsageTimeseries = React.useCallback(async () => {
    if (!accessToken || !isAdmin) {
      throw new Error("model usage timeseries requires an admin session");
    }
    return listAdminModelUsageTimeseries(accessToken, usageRange);
  }, [accessToken, isAdmin, usageRange]);
  const usageTimeseriesResource = useApiResource({
    enabled: Boolean(accessToken && isAdmin),
    cacheKey: ["system-model-usage-timeseries", currentSessionId, usageRange],
    load: loadUsageTimeseries,
    errorMessage: t("system.usageTimeseries.loadFailed"),
  });

  const usageSummary = React.useMemo(
    () => buildModelUsageSummary(models, usageRows),
    [models, usageRows],
  );
  const usageChart = React.useMemo(
    () =>
      buildModelUsageChart(models, usageTimeseriesResource.data, usageMetric),
    [models, usageMetric, usageTimeseriesResource.data],
  );

  const filteredModels = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return models
      .filter((model) => matchesStatusFilter(model, statusFilter))
      .filter((model) => matchesCapabilityFilters(model, selectedCapabilities))
      .filter((model) => {
        if (!keyword) return true;
        return `${model.id} ${model.display_name} ${model.upstream_model_name} ${model.upstream_base_url ?? ""}`
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => compareModels(a, b, sortKey, usageSummary));
  }, [
    models,
    query,
    selectedCapabilities,
    sortKey,
    statusFilter,
    usageSummary,
  ]);

  const metrics = React.useMemo(
    () => [
      {
        label: t("system.models.metrics.credits"),
        value: formatNumber(usageSummary.currentMonthCredits),
        detail: t("system.models.metrics.creditsDetail"),
        icon: ActivityIcon,
        tone: "blue" as const,
      },
      {
        label: t("system.models.metrics.requests"),
        value: formatNumber(usageSummary.currentMonthRequests),
        detail: t("system.models.metrics.requestsDetail"),
        icon: BarChart3Icon,
        tone: "green" as const,
      },
      {
        label: t("system.models.metrics.top"),
        value: usageSummary.topModelCreditsLabel,
        detail: usageSummary.topModelLabel,
        icon: TrendingUpIcon,
        tone: "indigo" as const,
      },
    ],
    [t, usageSummary],
  );

  const hasModelFilters =
    query.trim() ||
    statusFilter !== "active" ||
    selectedCapabilities.length > 0 ||
    sortKey !== "sort_order";

  function openCreateDialog() {
    setEditingModel({ ...emptyModel, metadata_json: {} });
    setEditingModelId(null);
    setDialogOpen(true);
  }

  function toggleExpandedModel(modelId: string) {
    setExpandedModelIds((current) => {
      const next = new Set(current);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }

  function toggleCapabilityFilter(capability: ModelCapabilityFilter) {
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  }

  function resetModelFilters() {
    setQuery("");
    setStatusFilter("active");
    setSelectedCapabilities([]);
    setSortKey("sort_order");
  }

  function openEditDialog(model: AdminModelProfile) {
    setEditingModel({
      display_name: model.display_name,
      endpoint_kind: model.endpoint_kind,
      upstream_model_name: model.upstream_model_name,
      upstream_base_url: model.upstream_base_url ?? null,
      upstream_api_key_ref: model.upstream_api_key_ref ?? null,
      default_temperature: model.default_temperature ?? null,
      default_top_p: model.default_top_p ?? null,
      default_frequency_penalty: model.default_frequency_penalty ?? null,
      default_presence_penalty: model.default_presence_penalty ?? null,
      default_max_tokens: model.default_max_tokens ?? null,
      context_window_tokens: model.context_window_tokens ?? null,
      max_output_tokens: model.max_output_tokens ?? null,
      supports_tool_calls: model.supports_tool_calls,
      supports_reasoning: model.supports_reasoning,
      supports_json_schema: model.supports_json_schema,
      supports_vision: model.supports_vision,
      usage_multiplier: model.usage_multiplier,
      enabled: model.enabled,
      sort_order: model.sort_order,
      metadata_json: model.metadata_json ?? {},
    });
    setEditingModelId(model.id);
    setDialogOpen(true);
  }

  async function saveModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !editingModel) return;
    if (
      editingModel.upstream_api_key_ref &&
      isRawApiKey(editingModel.upstream_api_key_ref)
    ) {
      const validationMessage = t("system.models.rawKeyValidation");
      setError(validationMessage);
      notify.warning({
        title: t("system.models.incomplete"),
        description: validationMessage,
      });
      return;
    }
    if (
      !editingModel.max_output_tokens ||
      editingModel.max_output_tokens <= 0
    ) {
      const validationMessage = t("system.models.outputValidation");
      setError(validationMessage);
      notify.warning({
        title: t("system.models.incomplete"),
        description: validationMessage,
      });
      return;
    }

    setState("saving");
    setError("");
    try {
      const payload = {
        ...editingModel,
        default_max_tokens: editingModel.max_output_tokens,
      };
      const result = editingModelId
        ? await updateAdminModelProfile(accessToken, editingModelId, payload)
        : await createAdminModelProfile(accessToken, payload);
      modelResource.setData((current) => ({
        profiles: [
          result.profile,
          ...(current?.profiles ?? []).filter(
            (item) => item.id !== result.profile.id,
          ),
        ],
        usage: current?.usage ?? [],
      }));
      invalidateApiResourceCache(["system-plans", currentSessionId]);
      invalidateApiResourceCache(["system-secrets", currentSessionId]);
      setMessage(
        t("system.models.savedMessage", { name: result.profile.display_name }),
      );
      notify.success({
        title: t("system.models.saved"),
        description: result.profile.display_name,
      });
      setDialogOpen(false);
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: t("system.models.saveFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.models.saveFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  async function deleteModel(model: AdminModelProfile) {
    if (!accessToken || model.archived_at) return;
    const confirmed = await confirm({
      title: t("system.models.deleteTitle", { name: model.display_name }),
      description: t("system.models.deleteDescription"),
      confirmLabel: t("system.models.deleteConfirm"),
      variant: "destructive",
    });
    if (!confirmed) {
      return;
    }
    setState("saving");
    setError("");
    try {
      const result = await deleteAdminModelProfile(accessToken, model.id);
      modelResource.setData((current) => ({
        profiles: [
          result.profile,
          ...(current?.profiles ?? []).filter(
            (item) => item.id !== result.profile.id,
          ),
        ],
        usage: current?.usage ?? [],
      }));
      invalidateApiResourceCache(["system-plans", currentSessionId]);
      invalidateApiResourceCache(["system-secrets", currentSessionId]);
      setMessage(
        t("system.models.deletedMessage", {
          name: result.profile.display_name,
        }),
      );
      notify.success({
        title: t("system.models.deleted"),
        description: result.profile.display_name,
      });
    } catch (deleteError) {
      const appError = normalizeAppError(deleteError, {
        fallbackMessage: t("system.models.deleteFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.models.deleteFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <SystemPageShell
      title={t("system.models.title")}
      subtitle={t("system.models.subtitle")}
      metrics={metrics}
      state={state}
      resourceState={modelResource.state}
      resourceError={modelResource.error}
      message={message}
      error={error}
      onRefresh={() => void modelResource.reload()}
    >
      <AppSectionCard
        title={t("system.models.usageTitle")}
        description={t("system.models.usageDescription")}
        icon={TrendingUpIcon}
      >
        <UsageTimeseriesPanel
          range={usageRange}
          onRangeChange={setUsageRange}
          metric={usageMetric}
          onMetricChange={(value) => setUsageMetric(value as ModelUsageMetric)}
          metricOptions={[
            "credits",
            "requests",
            "tokens",
            "failureRate",
            "latency",
          ]}
          granularity={usageTimeseriesResource.data?.granularity}
          state={usageTimeseriesResource.state}
          error={usageTimeseriesResource.error}
          onRetry={() => void usageTimeseriesResource.reload()}
          empty={usageTimeseriesResource.data?.has_data === false}
          data={usageChart.data}
          series={usageChart.series}
        />
      </AppSectionCard>

      <AppSectionCard
        title={t("system.models.listTitle")}
        description={t("system.models.listDescription")}
        icon={BotIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("system.models.search")}
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              {t("system.models.add")}
            </Button>
          }
          filters={
            <>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as ModelStatusFilter)
                }
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {t("system.models.filters.active")}
                  </SelectItem>
                  <SelectItem value="enabled">
                    {t("system.models.filters.enabled")}
                  </SelectItem>
                  <SelectItem value="disabled">
                    {t("system.models.filters.disabled")}
                  </SelectItem>
                  <SelectItem value="archived">
                    {t("system.models.filters.archived")}
                  </SelectItem>
                  <SelectItem value="all">
                    {t("system.models.filters.all")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortKey}
                onValueChange={(value) => setSortKey(value as ModelSortKey)}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sort_order">
                    {t("system.models.filters.defaultSort")}
                  </SelectItem>
                  <SelectItem value="current_credits">
                    {t("system.models.filters.currentCredits")}
                  </SelectItem>
                  <SelectItem value="current_requests">
                    {t("system.models.filters.currentRequests")}
                  </SelectItem>
                  <SelectItem value="range_credits">
                    {t("system.models.filters.rangeCredits")}
                  </SelectItem>
                  <SelectItem value="name">
                    {t("system.models.filters.name")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-wrap items-center gap-1.5">
                {capabilityFilters.map((filter) => (
                  <Button
                    key={filter.value}
                    type="button"
                    variant={
                      selectedCapabilities.includes(filter.value)
                        ? "secondary"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => toggleCapabilityFilter(filter.value)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>
            </>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredModels.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">
                    {t("system.models.columns.model")}
                  </th>
                  <th className="hidden w-1/4 px-4 py-3 @4xl/table:table-cell">
                    {t("system.models.columns.upstream")}
                  </th>
                  <th className="hidden w-1/4 px-4 py-3 @3xl/table:table-cell">
                    {t("system.models.columns.capability")}
                  </th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">
                    {t("system.models.columns.status")}
                  </th>
                  <th className="hidden w-20 px-4 py-3 @xl/table:table-cell">
                    {t("system.models.columns.multiplier")}
                  </th>
                  <th className="w-24 px-3 py-3 text-right sm:w-40 sm:px-4">
                    {t("system.models.columns.actions")}
                  </th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredModels.map((model) => {
                  const expanded = expandedModelIds.has(model.id);
                  return (
                    <React.Fragment key={model.id}>
                      <tr className="align-top hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              expanded
                                ? t("system.models.collapse")
                                : t("system.models.expand")
                            }
                            onClick={() => toggleExpandedModel(model.id)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">
                            {model.display_name}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {model.id}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @4xl/table:table-cell">
                          <div className="truncate">
                            {model.upstream_model_name}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {model.endpoint_kind}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            {model.supports_tool_calls ? (
                              <CapabilityTag>
                                {t("system.models.capabilities.toolShort")}
                              </CapabilityTag>
                            ) : null}
                            {model.supports_reasoning ? (
                              <CapabilityTag>
                                {t("system.models.capabilities.reasoningShort")}
                              </CapabilityTag>
                            ) : null}
                            {model.supports_vision ? (
                              <CapabilityTag>
                                {t("system.models.capabilities.visionShort")}
                              </CapabilityTag>
                            ) : null}
                            {model.max_output_tokens ? (
                              <CapabilityTag>
                                max {model.max_output_tokens}
                              </CapabilityTag>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
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
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          {model.usage_multiplier}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end gap-1 sm:gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(model)}
                              disabled={Boolean(model.archived_at)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">
                                {t("system.models.edit")}
                              </span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void deleteModel(model)}
                              disabled={
                                state !== "idle" || Boolean(model.archived_at)
                              }
                            >
                              <Trash2Icon />
                              <span className="hidden sm:inline">
                                {t("system.models.delete")}
                              </span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <AppExpandablePanel>
                              <ModelDetail model={model} />
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
          {filteredModels.length === 0 ? (
            <EmptyState
              title={
                hasModelFilters
                  ? t("system.models.noMatches")
                  : t("system.models.empty")
              }
              detail={
                hasModelFilters
                  ? t("system.models.noMatchesDescription")
                  : t("system.models.emptyDescription")
              }
              action={
                hasModelFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetModelFilters}
                  >
                    {t("system.models.reset")}
                  </Button>
                ) : null
              }
            />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={
          editingModelId
            ? t("system.models.editTitle")
            : t("system.models.addTitle")
        }
        description={t("system.models.dialogDescription")}
        maxWidth="3xl"
        footer={
          editingModel ? (
            <AppDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("system.models.form.cancel")}
              </Button>
              <Button
                type="submit"
                form="admin-model-form"
                disabled={state !== "idle"}
              >
                <SaveIcon />
                {t("system.models.form.save")}
              </Button>
            </AppDialogFooter>
          ) : undefined
        }
        onOpenChange={setDialogOpen}
      >
        {editingModel ? (
          <ModelForm
            model={editingModel}
            onChange={setEditingModel}
            onSubmit={saveModel}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  );
}

function ModelDetail({ model }: { model: AdminModelProfile }) {
  const { t } = useTranslation();
  const locale = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <DetailItem
        label="Base URL"
        value={model.upstream_base_url ?? t("system.models.unconfigured")}
      />
      <DetailItem
        label="API key ref"
        value={model.upstream_api_key_ref ?? t("system.models.unconfigured")}
      />
      <DetailItem
        label="Context window"
        value={
          model.context_window_tokens?.toLocaleString(locale) ??
          t("system.models.unconfigured")
        }
      />
      <DetailItem
        label="Default max tokens"
        value={
          model.default_max_tokens?.toLocaleString(locale) ??
          t("system.models.unconfigured")
        }
      />
      <DetailItem label="Sort order" value={String(model.sort_order)} />
      <DetailItem
        label="JSON schema"
        value={
          model.supports_json_schema
            ? t("system.models.supported")
            : t("system.models.unsupported")
        }
      />
      <DetailItem
        label="Temperature"
        value={
          model.default_temperature == null
            ? t("system.models.defaultValue")
            : String(model.default_temperature)
        }
      />
      <DetailItem
        label="Top P"
        value={
          model.default_top_p == null
            ? t("system.models.defaultValue")
            : String(model.default_top_p)
        }
      />
    </div>
  );
}

function buildModelUsageSummary(
  models: AdminModelProfile[],
  usageRows: AdminModelMonthlyUsage[],
) {
  const modelNames = new Map(
    models.map((model) => [model.id, model.display_name]),
  );
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentRows = usageRows.filter(
    (row) => row.period_yyyymm === currentPeriod,
  );
  const currentMonthCredits = currentRows.reduce(
    (sum, row) => sum + row.charged_credits,
    0,
  );
  const currentMonthRequests = currentRows.reduce(
    (sum, row) => sum + row.request_count,
    0,
  );
  const modelTotals = new Map<string, number>();
  for (const row of usageRows) {
    modelTotals.set(
      row.model_profile_id,
      (modelTotals.get(row.model_profile_id) ?? 0) + row.charged_credits,
    );
  }
  const topModels = Array.from(modelTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const [topModelId, topModelCredits] = topModels[0] ?? [];

  return {
    currentMonthCredits,
    currentMonthRequests,
    currentCreditsByModel: new Map(
      currentRows.map((row) => [row.model_profile_id, row.charged_credits]),
    ),
    currentRequestsByModel: new Map(
      currentRows.map((row) => [row.model_profile_id, row.request_count]),
    ),
    rangeCreditsByModel: modelTotals,
    topModelLabel: topModelId
      ? (modelNames.get(topModelId) ?? topModelId)
      : "-",
    topModelCreditsLabel:
      topModelCredits == null ? "-" : formatNumber(topModelCredits),
  };
}

function matchesStatusFilter(
  model: AdminModelProfile,
  statusFilter: ModelStatusFilter,
) {
  switch (statusFilter) {
    case "active":
      return !model.archived_at;
    case "enabled":
      return model.enabled && !model.archived_at;
    case "disabled":
      return !model.enabled && !model.archived_at;
    case "archived":
      return Boolean(model.archived_at);
    case "all":
      return true;
  }
}

function matchesCapabilityFilters(
  model: AdminModelProfile,
  selectedCapabilities: ModelCapabilityFilter[],
) {
  return selectedCapabilities.every((capability) => {
    switch (capability) {
      case "tool":
        return model.supports_tool_calls;
      case "reasoning":
        return model.supports_reasoning;
      case "vision":
        return model.supports_vision;
      case "json":
        return model.supports_json_schema;
    }
  });
}

function compareModels(
  a: AdminModelProfile,
  b: AdminModelProfile,
  sortKey: ModelSortKey,
  usageSummary: ReturnType<typeof buildModelUsageSummary>,
) {
  switch (sortKey) {
    case "name":
      return a.display_name.localeCompare(b.display_name);
    case "current_credits":
      return (
        (usageSummary.currentCreditsByModel.get(b.id) ?? 0) -
        (usageSummary.currentCreditsByModel.get(a.id) ?? 0)
      );
    case "current_requests":
      return (
        (usageSummary.currentRequestsByModel.get(b.id) ?? 0) -
        (usageSummary.currentRequestsByModel.get(a.id) ?? 0)
      );
    case "range_credits":
      return (
        (usageSummary.rangeCreditsByModel.get(b.id) ?? 0) -
        (usageSummary.rangeCreditsByModel.get(a.id) ?? 0)
      );
    case "sort_order":
      return (
        a.sort_order - b.sort_order ||
        a.display_name.localeCompare(b.display_name)
      );
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(getCurrentLocale(), {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 1 : 2,
  }).format(value);
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm">{value}</div>
    </div>
  );
}

function CapabilityTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function ModelForm({
  model,
  onChange,
  onSubmit,
}: {
  model: AdminModelProfilePayload;
  onChange: React.Dispatch<
    React.SetStateAction<AdminModelProfilePayload | null>
  >;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <form
      id="admin-model-form"
      onSubmit={(event) => void onSubmit(event)}
      className="space-y-4"
    >
      <AppDisclosureSection
        title={t("system.models.form.basic")}
        description={t("system.models.form.basicDescription")}
      >
        <AppFieldGrid>
          <FormField label={t("system.models.form.displayName")}>
            <Input
              value={model.display_name}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, display_name: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="Endpoint">
            <Input
              value={model.endpoint_kind}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, endpoint_kind: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection
        title={t("system.models.form.upstream")}
        description={t("system.models.form.upstreamDescription")}
      >
        <AppFieldGrid>
          <FormField label={t("system.models.form.upstreamModel")}>
            <Input
              value={model.upstream_model_name}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, upstream_model_name: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="Base URL">
            <Input
              value={model.upstream_base_url ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        upstream_base_url: textOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.models.form.keyRef")}>
            <Input
              value={model.upstream_api_key_ref ?? ""}
              placeholder={t("system.models.form.keyPlaceholder")}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        upstream_api_key_ref: textOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title={t("system.models.form.limits")}>
        <AppFieldGrid>
          <FormField label={t("system.models.form.context")}>
            <Input
              type="number"
              value={model.context_window_tokens ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        context_window_tokens: numberOrNull(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.models.form.maxOutput")}>
            <Input
              type="number"
              min={1}
              value={model.max_output_tokens ?? ""}
              onChange={(event) => {
                const value = numberOrNull(event.target.value);
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        max_output_tokens: value,
                        default_max_tokens: value,
                      }
                    : current,
                );
              }}
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title={t("system.models.form.capabilities")}>
        <AppFieldGrid columns={4}>
          <ToggleField
            label={t("system.models.form.enable")}
            checked={model.enabled}
            onCheckedChange={(checked) =>
              onChange((current) =>
                current ? { ...current, enabled: checked } : current,
              )
            }
          />
          <ToggleField
            label="Tool"
            checked={model.supports_tool_calls}
            onCheckedChange={(checked) =>
              onChange((current) =>
                current
                  ? { ...current, supports_tool_calls: checked }
                  : current,
              )
            }
          />
          <ToggleField
            label="Reasoning"
            checked={model.supports_reasoning}
            onCheckedChange={(checked) =>
              onChange((current) =>
                current ? { ...current, supports_reasoning: checked } : current,
              )
            }
          />
          <ToggleField
            label="Vision"
            checked={model.supports_vision}
            onCheckedChange={(checked) =>
              onChange((current) =>
                current ? { ...current, supports_vision: checked } : current,
              )
            }
          />
        </AppFieldGrid>
      </AppDisclosureSection>

      <AppDisclosureSection title={t("system.models.form.billing")}>
        <AppFieldGrid>
          <FormField label={t("system.models.form.multiplier")}>
            <Input
              type="number"
              step="0.01"
              value={model.usage_multiplier}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        usage_multiplier: Number(event.target.value),
                      }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label={t("system.models.form.sort")}>
            <Input
              type="number"
              value={model.sort_order}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? { ...current, sort_order: Number(event.target.value) }
                    : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>
    </form>
  );
}
