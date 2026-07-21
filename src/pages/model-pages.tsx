import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon,
  BrainCircuitIcon,
  BracesIcon,
  EyeIcon,
  GaugeIcon,
  MessageSquareTextIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";

import {
  AppListToolbar,
  AppMetricPage,
  AppSearchBar,
  DataState,
  Notice,
  StatusBadge,
} from "@/components/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthSession } from "@/features/auth/app-session";
import {
  listModelProfiles,
  type ModelProfile,
} from "@/features/models/api/model-api";
import { useApiResource } from "@/lib/app/use-api-resource";
import { i18n, normalizeLanguage } from "@/lib/i18n/i18n";

function formatTokenLimit(value?: number | null) {
  if (!value) return i18n.t("modelCenter.unset");
  const locale = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString(locale)}M`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString(locale)}K`;
  return value.toLocaleString(locale);
}

function capabilityItems(profile: ModelProfile) {
  return [
    {
      label: i18n.t("modelCenter.capabilities.tools"),
      enabled: profile.supports_tool_calls,
      icon: WrenchIcon,
    },
    {
      label: i18n.t("modelCenter.capabilities.reasoning"),
      enabled: profile.supports_reasoning,
      icon: BrainCircuitIcon,
    },
    {
      label: i18n.t("modelCenter.capabilities.json"),
      enabled: profile.supports_json_schema,
      icon: BracesIcon,
    },
    {
      label: i18n.t("modelCenter.capabilities.vision"),
      enabled: profile.supports_vision,
      icon: EyeIcon,
    },
  ];
}

function ModelProfileCard({ profile }: { profile: ModelProfile }) {
  const { t } = useTranslation();
  const capabilities = capabilityItems(profile);

  return (
    <Card className="border-border/80 bg-muted/25 py-0 shadow-none transition-colors hover:bg-muted/40">
      <CardHeader className="border-b border-border/70 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
              <BotIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">{profile.display_name}</CardTitle>
              <CardDescription className="mt-1 truncate font-mono text-xs">
                {profile.id}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status="usable" label={t("modelCenter.usable")} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-background/70 p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">
              {t("modelCenter.contextWindow")}
            </p>
            <p className="mt-1 font-semibold">
              {formatTokenLimit(profile.context_window_tokens)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              {t("modelCenter.singleOutput")}
            </p>
            <p className="mt-1 font-semibold">
              {formatTokenLimit(profile.max_output_tokens)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              {t("modelCenter.requestLimit")}
            </p>
            <p className="mt-1 font-semibold">
              {formatTokenLimit(profile.max_tokens_per_request)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              {t("modelCenter.usageMultiplier")}
            </p>
            <p className="mt-1 font-semibold">
              ×
              {profile.usage_multiplier.toLocaleString(
                normalizeLanguage(i18n.resolvedLanguage || i18n.language),
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {capabilities.map((capability) => {
            const Icon = capability.icon;
            return (
              <Badge
                key={capability.label}
                variant="outline"
                className={
                  capability.enabled
                    ? "bg-background"
                    : "text-muted-foreground opacity-55"
                }
              >
                <Icon />
                {capability.enabled
                  ? capability.label
                  : t("modelCenter.unavailableCapability", {
                      capability: capability.label,
                    })}
              </Badge>
            );
          })}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          {t("modelCenter.billingMultipliers", {
            input: profile.input_multiplier,
            output: profile.output_multiplier,
            reasoning: profile.reasoning_multiplier,
            cached: profile.cached_input_multiplier,
          })}
        </p>
      </CardContent>
    </Card>
  );
}

export function ModelCenterPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuthSession();
  const [query, setQuery] = React.useState("");
  const loadProfiles = React.useCallback(
    () => listModelProfiles(accessToken || ""),
    [accessToken],
  );
  const resource = useApiResource({
    enabled: Boolean(accessToken),
    load: loadProfiles,
    errorMessage: t("modelCenter.loadFailed"),
  });
  const profiles = React.useMemo(
    () => resource.data?.profiles ?? [],
    [resource.data?.profiles],
  );
  const metricValue = React.useCallback(
    (value: number) => (resource.state === "success" ? String(value) : "—"),
    [resource.state],
  );
  const filteredProfiles = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return profiles;
    return profiles.filter((profile) =>
      `${profile.display_name} ${profile.id}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [profiles, query]);
  const openAssistant = React.useCallback(() => {
    window.dispatchEvent(new Event("ineffable:right-sidebar:open"));
  }, []);

  return (
    <AppMetricPage
      eyebrow="Models"
      title={t("modelCenter.title")}
      subtitle={t("modelCenter.subtitle")}
      metrics={[
        {
          label: t("modelCenter.availableModels"),
          value: metricValue(profiles.length),
          detail: t("modelCenter.visibleInPlan"),
          icon: BotIcon,
          tone: "blue",
        },
        {
          label: t("modelCenter.capabilities.tools"),
          value: metricValue(
            profiles.filter((profile) => profile.supports_tool_calls).length,
          ),
          detail: t("modelCenter.workspaceTasks"),
          icon: WrenchIcon,
          tone: "green",
        },
        {
          label: t("modelCenter.reasoningModels"),
          value: metricValue(
            profiles.filter((profile) => profile.supports_reasoning).length,
          ),
          detail: t("modelCenter.reasoningSupported"),
          icon: BrainCircuitIcon,
          tone: "indigo",
        },
      ]}
      headerActions={
        <Button type="button" size="sm" onClick={openAssistant}>
          <MessageSquareTextIcon />
          {t("modelCenter.openAssistant")}
        </Button>
      }
    >
      <Notice title={t("modelCenter.howToUse")}>
        {t("modelCenter.howToUseDescription")}
      </Notice>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-muted/15">
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("modelCenter.search")}
            />
          }
          filters={
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <GaugeIcon className="size-3.5" />
              {t("modelCenter.results", { count: filteredProfiles.length })}
            </span>
          }
        />

        <div className="p-4">
          <DataState
            state={resource.state}
            error={resource.error}
            empty={profiles.length === 0}
            emptyTitle={t("modelCenter.empty")}
            emptyDescription={t("modelCenter.emptyDescription")}
            onRetry={resource.reload}
          >
            {filteredProfiles.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredProfiles.map((profile) => (
                  <ModelProfileCard key={profile.id} profile={profile} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <SparklesIcon className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">
                  {t("modelCenter.noMatches")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("modelCenter.noMatchesDescription")}
                </p>
              </div>
            )}
          </DataState>
        </div>
      </section>
    </AppMetricPage>
  );
}
