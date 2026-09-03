import * as React from "react";
import { useTranslation } from "react-i18next";
import { ShieldIcon } from "lucide-react";

import {
  AppMetricPage,
  DataState,
  Notice,
  type AppMetricCard,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  type AdminModelProfilePayload,
  type AdminPlanPayload,
  type AdminPlanModelAccess,
} from "@/lib/api/api-client";
import { i18n } from "@/lib/i18n/i18n";
import type { AppError } from "@/lib/app/api-errors";
import type { ApiResourceState } from "@/lib/app/use-api-resource";

export type LoadState = "idle" | "loading" | "saving";

export function systemStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  const translated = i18n.t(`system.common.status.${normalized}`, {
    defaultValue: "",
  });
  return translated || status;
}

export const emptyModel: AdminModelProfilePayload = {
  display_name: "DeepSeek Chat",
  endpoint_kind: "openai_compatible",
  upstream_model_name: "deepseek-chat",
  upstream_base_url: "https://api.deepseek.com",
  upstream_api_key_ref: null,
  default_temperature: 0.7,
  default_top_p: 1,
  default_frequency_penalty: 0,
  default_presence_penalty: 0,
  default_max_tokens: 8192,
  context_window_tokens: null,
  max_output_tokens: 8192,
  supports_tool_calls: true,
  supports_reasoning: false,
  supports_json_schema: false,
  supports_vision: false,
  usage_multiplier: 1,
  enabled: true,
  sort_order: 10,
  metadata_json: {},
};

export const emptyPlan: AdminPlanPayload = {
  name: "pro",
  display_name: "Pro",
  monthly_credit_limit: 100000,
  workspace_storage_limit_bytes: 10 * 1024 * 1024 * 1024,
  max_workspace_count: 3,
  max_members_per_workspace: 10,
  workspace_object_count_limit: 500,
  max_file_size_bytes: 50 * 1024 * 1024,
  max_active_cloud_sandboxes: 1,
  agent_evolution_policy: {
    allow_definition_recomposition: false,
    allow_artifact_nodes: false,
    allow_runtime_lab: false,
    max_definitions: 16,
    max_candidates_per_evaluation: 2,
    max_generation_depth: 4,
    max_parallel_evaluations: 1,
    max_evaluation_tokens: 50000,
    max_evaluation_cost_credits: 25,
    max_evaluation_wall_ms: 300000,
    runtime_lab_ttl_seconds: 3600,
    max_runtime_labs: 1,
    max_runtime_lab_components: 8,
    runtime_lab_allowed_component_kinds: ["node"],
    runtime_lab_revocation_grace_seconds: 900,
  },
  capability_exposure_policy: {
    allowed_modes: ["clean", "smart"],
    default_mode: "smart",
    allowed_families: [],
    max_exposed_tools: 12,
    max_schema_bytes: 32768,
    max_prefetched_tools: 4,
    max_dynamic_tools: 8,
    max_discovery_results: 5,
  },
  enabled: true,
};

export const emptySecret = {
  secret_ref: "deepseek-default",
  secret: "",
  status: "active",
  metadata_json: {},
};

export function numberOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

export function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isRawApiKey(value: string) {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("sk-") ||
    trimmed.startsWith("sk_") ||
    trimmed.startsWith("bearer ")
  );
}

export function modelAccessFor(
  planId: string,
  modelId: string,
): AdminPlanModelAccess {
  return {
    plan_id: planId,
    model_profile_id: modelId,
    visible: true,
    usable: true,
    input_multiplier: 1,
    output_multiplier: 1,
    reasoning_multiplier: 1,
    cached_input_multiplier: 0.25,
    max_tokens_per_request: null,
    max_requests_per_day: null,
  };
}

export function normalizeAccess(
  access: AdminPlanModelAccess,
): AdminPlanModelAccess {
  return {
    ...access,
    usable: access.visible ? access.usable : false,
  };
}

export function AdminAccessDenied() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
      <div className="rounded-lg border bg-background p-6">
        <ShieldIcon className="mb-3 size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          {t("system.common.accessDenied")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("system.common.accessDeniedDescription")}
        </p>
      </div>
    </main>
  );
}

export function SystemPageShell({
  title,
  subtitle,
  metrics,
  state,
  resourceState,
  resourceError,
  message,
  error,
  onRefresh,
  children,
}: {
  title: string;
  subtitle: string;
  metrics: AppMetricCard[];
  state: LoadState;
  resourceState: ApiResourceState;
  resourceError?: AppError | null;
  message: string;
  error: string;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <AppMetricPage
      eyebrow={t("system.common.eyebrow")}
      title={title}
      subtitle={subtitle}
      metrics={
        resourceState === "loading"
          ? metrics.map((metric) => ({
              ...metric,
              value: "—",
              detail: t("system.common.loading"),
            }))
          : metrics
      }
      headerActions={
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={
            state !== "idle" ||
            resourceState === "loading" ||
            resourceState === "refreshing"
          }
        >
          {t("system.common.refresh")}
        </Button>
      }
    >
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <DataState
        state={resourceState}
        error={resourceError}
        empty={false}
        onRetry={onRefresh}
      >
        {children}
      </DataState>
    </AppMetricPage>
  );
}
