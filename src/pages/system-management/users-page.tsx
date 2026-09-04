import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  Edit3Icon,
  GaugeIcon,
  HardDriveIcon,
  PackageIcon,
  SaveIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppDialog,
  AppDialogFooter,
  AppDisclosureSection,
  AppExpandablePanel,
  AppFieldGrid,
  AppLineChart,
  type AppLineChartDatum,
  type AppLineChartSeries,
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
  assignAdminUserPlan,
  listAdminPlans,
  listAdminUserMonthlyUsage,
  listAdminUserPlanAssignments,
  listAdminUsers,
  listAdminWorkspaceUsage,
  setAdminUserRole,
  type AdminPlan,
  type AdminUser,
  type AdminUserMonthlyUsage,
  type AdminUserPlanAssignment,
  type AdminWorkspaceUsage,
} from "@/lib/api/api-client";
import { normalizeAppError } from "@/lib/app/api-errors";
import { notify } from "@/lib/app/notifications";
import { useApiResource } from "@/lib/app/use-api-resource";
import { i18n, normalizeLanguage } from "@/lib/i18n/i18n";

import {
  AdminAccessDenied,
  SystemPageShell,
  systemStatusLabel,
  type LoadState,
} from "./shared";

type UserDetails = {
  assignments: AdminUserPlanAssignment[];
  usage: AdminUserMonthlyUsage[];
};

export function SystemUserManagementPage() {
  const { t } = useTranslation();
  const { accessToken, currentSessionId, currentUser } = useAuthSession();
  const [userDetailsByUserId, setUserDetailsByUserId] = React.useState<
    Record<string, UserDetails>
  >({});
  const [query, setQuery] = React.useState("");
  const [expandedUserIds, setExpandedUserIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [editingUser, setEditingUser] = React.useState<AdminUser | null>(null);
  const [editingRole, setEditingRole] = React.useState<"user" | "admin">(
    "user",
  );
  const [editingUserPlanId, setEditingUserPlanId] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const editingUserIdRef = React.useRef("");
  const userDetailsPromisesRef = React.useRef(
    new Map<string, Promise<UserDetails | null>>(),
  );
  const [state, setState] = React.useState<LoadState>("idle");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const isAdmin = currentUser?.role === "admin";

  const loadUsers = React.useCallback(async () => {
    if (!accessToken || !isAdmin) {
      return {
        users: [] as AdminUser[],
        plans: [] as AdminPlan[],
        workspaceUsage: [] as AdminWorkspaceUsage[],
      };
    }
    const [userResult, planResult, workspaceUsageResult] = await Promise.all([
      listAdminUsers(accessToken),
      listAdminPlans(accessToken),
      listAdminWorkspaceUsage(accessToken),
    ]);
    return {
      users: userResult.users,
      plans: planResult.plans,
      workspaceUsage: workspaceUsageResult.usage,
    };
  }, [accessToken, isAdmin]);
  const userResource = useApiResource({
    enabled: Boolean(accessToken && isAdmin),
    cacheKey: ["system-users", currentSessionId],
    load: loadUsers,
    errorMessage: t("system.users.loadFailed"),
  });
  const users = React.useMemo(
    () => userResource.data?.users ?? [],
    [userResource.data?.users],
  );
  const plans = React.useMemo(
    () => userResource.data?.plans ?? [],
    [userResource.data?.plans],
  );
  const workspaceUsage = React.useMemo(
    () => userResource.data?.workspaceUsage ?? [],
    [userResource.data?.workspaceUsage],
  );

  React.useEffect(() => {
    if (!plans.length) return;
    setEditingUserPlanId((current) =>
      plans.some((plan) => plan.id === current)
        ? current
        : (plans[0]?.id ?? ""),
    );
  }, [plans]);

  const loadUserDetails = React.useCallback(
    (userId: string) => {
      if (!accessToken || !isAdmin || !userId) return Promise.resolve(null);
      const requestKey = `${accessToken}:${userId}`;
      const activeLoad = userDetailsPromisesRef.current.get(requestKey);
      if (activeLoad) return activeLoad;

      const promise = (async () => {
        try {
          const [planResult, usageResult] = await Promise.all([
            listAdminUserPlanAssignments(accessToken, userId),
            listAdminUserMonthlyUsage(accessToken, userId),
          ]);
          const details = {
            assignments: planResult.assignments,
            usage: usageResult.usage,
          };
          setUserDetailsByUserId((current) => ({
            ...current,
            [userId]: details,
          }));
          return details;
        } catch (loadError) {
          const appError = normalizeAppError(loadError, {
            fallbackMessage: t("system.users.loadFailed"),
          });
          setError(appError.message);
          notify.error({
            title: t("system.users.detailLoadFailedTitle"),
            description: appError.message,
          });
          return null;
        }
      })();
      userDetailsPromisesRef.current.set(requestKey, promise);
      void promise.then(
        () => userDetailsPromisesRef.current.delete(requestKey),
        () => userDetailsPromisesRef.current.delete(requestKey),
      );
      return promise;
    },
    [accessToken, isAdmin, t],
  );

  const filteredUsers = React.useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) =>
      `${user.id} ${user.email} ${user.display_name} ${user.role ?? ""} ${user.status}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [query, users]);

  const workspaceUsageByOwnerId = React.useMemo(() => {
    const grouped = new Map<string, AdminWorkspaceUsage[]>();
    for (const item of workspaceUsage) {
      const rows = grouped.get(item.owner_user_id) ?? [];
      rows.push(item);
      grouped.set(item.owner_user_id, rows);
    }
    return grouped;
  }, [workspaceUsage]);

  const metrics = React.useMemo(() => {
    const cachedDetails = Object.values(userDetailsByUserId);
    return [
      {
        label: t("system.users.metrics.users"),
        value: String(users.length),
        detail: t("system.users.metrics.admins", {
          count: users.filter((user) => user.role === "admin").length,
        }),
        icon: UsersIcon,
        tone: "blue" as const,
      },
      {
        label: t("system.users.metrics.assignments"),
        value: String(
          cachedDetails.reduce(
            (total, details) => total + details.assignments.length,
            0,
          ),
        ),
        detail: t("system.users.metrics.detailsLoaded"),
        icon: PackageIcon,
        tone: "green" as const,
      },
      {
        label: t("system.users.metrics.usage"),
        value: String(
          cachedDetails.reduce(
            (total, details) => total + details.usage.length,
            0,
          ),
        ),
        detail: t("system.users.metrics.monthlyLoaded"),
        icon: GaugeIcon,
        tone: "amber" as const,
      },
      {
        label: t("system.users.metrics.storage"),
        value: formatBytes(
          workspaceUsage.reduce((total, item) => total + item.storage_bytes, 0),
        ),
        detail: t("system.users.metrics.workspaces", {
          count: workspaceUsage.length,
        }),
        icon: HardDriveIcon,
        tone: "indigo" as const,
      },
    ];
  }, [t, userDetailsByUserId, users, workspaceUsage]);

  function openEditDialog(user: AdminUser) {
    const cachedDetails = userDetailsByUserId[user.id];
    editingUserIdRef.current = user.id;
    setEditingUser(user);
    setEditingRole(user.role === "admin" ? "admin" : "user");
    setEditingUserPlanId(
      getActiveUserPlanId(cachedDetails?.assignments) ?? plans[0]?.id ?? "",
    );
    setDialogOpen(true);

    void loadUserDetails(user.id).then((details) => {
      if (!details) return;
      if (editingUserIdRef.current !== user.id) return;
      setEditingUserPlanId(
        getActiveUserPlanId(details.assignments) ?? plans[0]?.id ?? "",
      );
    });
  }

  function toggleExpandedUser(userId: string) {
    const willExpand = !expandedUserIds.has(userId);
    setExpandedUserIds(willExpand ? new Set([userId]) : new Set());
    if (willExpand && !userDetailsByUserId[userId]) {
      void loadUserDetails(userId);
    }
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !editingUser) return;
    setState("saving");
    setError("");
    try {
      const roleResult = await setAdminUserRole(accessToken, {
        user_id: editingUser.id,
        role: editingRole,
      });
      userResource.setData((current) => ({
        users: (current?.users ?? []).map((item) =>
          item.id === editingUser.id ? roleResult.user : item,
        ),
        plans: current?.plans ?? [],
        workspaceUsage: current?.workspaceUsage ?? [],
      }));

      if (editingUserPlanId) {
        const planResult = await assignAdminUserPlan(accessToken, {
          user_id: editingUser.id,
          plan_id: editingUserPlanId,
        });
        setUserDetailsByUserId((current) => {
          const details = current[editingUser.id] ?? {
            assignments: [],
            usage: [],
          };
          return {
            ...current,
            [editingUser.id]: {
              ...details,
              assignments: [
                planResult.assignment,
                ...details.assignments.filter(
                  (item) => item.id !== planResult.assignment.id,
                ),
              ],
            },
          };
        });
      }

      setMessage(
        t("system.users.savedMessage", { email: roleResult.user.email }),
      );
      notify.success({
        title: t("system.users.saved"),
        description: roleResult.user.email,
      });
      setDialogOpen(false);
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: t("system.users.saveFailed"),
      });
      setError(appError.message);
      notify.error({
        title: t("system.users.saveFailedTitle"),
        description: appError.message,
      });
    } finally {
      setState("idle");
    }
  }

  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <SystemPageShell
      title={t("system.users.title")}
      subtitle={t("system.users.subtitle")}
      metrics={metrics}
      state={state}
      resourceState={userResource.state}
      resourceError={userResource.error}
      message={message}
      error={error}
      onRefresh={() => void userResource.reload()}
    >
      <AppSectionCard
        title={t("system.users.listTitle")}
        description={t("system.users.listDescription")}
        icon={UsersIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder={t("system.users.search")}
            />
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredUsers.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">
                    {t("system.users.columns.user")}
                  </th>
                  <th className="hidden w-20 px-4 py-3 @xl/table:table-cell">
                    {t("system.users.columns.role")}
                  </th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">
                    {t("system.users.columns.status")}
                  </th>
                  <th className="hidden w-28 px-4 py-3 @3xl/table:table-cell">
                    {t("system.users.columns.plans")}
                  </th>
                  <th className="hidden w-28 px-4 py-3 @4xl/table:table-cell">
                    {t("system.users.columns.monthly")}
                  </th>
                  <th className="hidden w-36 px-4 py-3 @5xl/table:table-cell">
                    {t("system.users.columns.workspace")}
                  </th>
                  <th className="w-16 px-3 py-3 text-right sm:w-24 sm:px-4">
                    {t("system.users.columns.actions")}
                  </th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredUsers.map((user) => {
                  const expanded = expandedUserIds.has(user.id);
                  const userDetails = userDetailsByUserId[user.id];
                  const rowAssignments = userDetails?.assignments ?? [];
                  const rowUsage = userDetails?.usage ?? [];
                  const rowWorkspaceUsage =
                    workspaceUsageByOwnerId.get(user.id) ?? [];

                  return (
                    <React.Fragment key={user.id}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              expanded
                                ? t("system.users.collapse")
                                : t("system.users.expand")
                            }
                            onClick={() => toggleExpandedUser(user.id)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">
                            {user.display_name || user.email}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          <StatusBadge
                            status={user.role ?? "user"}
                            label={systemStatusLabel(user.role ?? "user")}
                          />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge
                            status={user.status}
                            label={systemStatusLabel(user.status)}
                          />
                        </td>
                        <td className="hidden px-4 py-3 @3xl/table:table-cell">
                          {userDetails ? rowAssignments.length : "-"}
                        </td>
                        <td className="hidden px-4 py-3 @4xl/table:table-cell">
                          {userDetails ? rowUsage.length : "-"}
                        </td>
                        <td className="hidden px-4 py-3 @5xl/table:table-cell">
                          <div className="text-sm font-medium">
                            {formatBytes(
                              rowWorkspaceUsage.reduce(
                                (total, item) => total + item.storage_bytes,
                                0,
                              ),
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("system.users.workspaceCount", {
                              count: rowWorkspaceUsage.length,
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(user)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">
                                {t("system.users.edit")}
                              </span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <AppExpandablePanel>
                              {userDetails ? (
                                <UserDetail
                                  assignments={rowAssignments}
                                  usage={rowUsage}
                                  workspaceUsage={rowWorkspaceUsage}
                                  user={user}
                                />
                              ) : (
                                <EmptyState
                                  title={t("system.users.detailLoading")}
                                  detail={t(
                                    "system.users.detailLoadingDescription",
                                  )}
                                />
                              )}
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
          {filteredUsers.length === 0 ? (
            <EmptyState
              title={t("system.users.empty")}
              detail={t("system.users.emptyDescription")}
            />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={t("system.users.editTitle")}
        description={t("system.users.editDescription")}
        onOpenChange={setDialogOpen}
      >
        {editingUser ? (
          <form
            onSubmit={(event) => void saveUser(event)}
            className="space-y-4"
          >
            <AppDisclosureSection title={t("system.users.roleAndPlan")}>
              <AppFieldGrid columns={1}>
                <FormField label={t("system.users.user")}>
                  <Input value={editingUser.email} readOnly />
                </FormField>
                <FormField label={t("system.users.role")}>
                  <select
                    value={editingRole}
                    disabled={state !== "idle"}
                    onChange={(event) =>
                      setEditingRole(
                        event.target.value === "admin" ? "admin" : "user",
                      )
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="user">
                      {t("system.users.standardUser")}
                    </option>
                    <option value="admin">{t("system.users.admin")}</option>
                  </select>
                </FormField>
                <FormField label={t("system.users.assignPlan")}>
                  <select
                    value={editingUserPlanId}
                    onChange={(event) =>
                      setEditingUserPlanId(event.target.value)
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.display_name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </AppFieldGrid>
            </AppDisclosureSection>
            <AppDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("system.users.cancel")}
              </Button>
              <Button type="submit" disabled={state !== "idle"}>
                <SaveIcon />
                {t("system.users.save")}
              </Button>
            </AppDialogFooter>
          </form>
        ) : null}
      </AppDialog>
    </SystemPageShell>
  );
}

function getActiveUserPlanId(assignments?: AdminUserPlanAssignment[]) {
  return assignments
    ?.filter((assignment) => assignment.status === "active")
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
    ?.plan_id;
}

function UserDetail({
  assignments,
  usage,
  workspaceUsage,
  user,
}: {
  assignments: AdminUserPlanAssignment[];
  usage: AdminUserMonthlyUsage[];
  workspaceUsage: AdminWorkspaceUsage[];
  user: AdminUser;
}) {
  const { t } = useTranslation();
  const usageTrend = React.useMemo(() => buildUserUsageTrend(usage), [usage]);
  const riskItems = React.useMemo(
    () => buildUserRiskItems(assignments, usage, workspaceUsage),
    [assignments, usage, workspaceUsage],
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GaugeIcon className="size-4 text-muted-foreground" />
          {t("system.users.detail.trend")}
        </div>
        <AppLineChart
          data={usageTrend.chartData}
          series={usageTrend.chartSeries}
          height={180}
          valueFormatter={formatMetricNumber}
          emptyTitle={t("system.users.detail.trendEmpty")}
          emptyDescription={t("system.users.detail.trendEmptyDescription")}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UsersIcon className="size-4 text-muted-foreground" />
          {t("system.users.detail.risks")}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {riskItems.map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <div className="font-medium">{item.label}</div>
              <div className="mt-1 text-muted-foreground">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <PackageIcon className="size-4 text-muted-foreground" />
          {t("system.users.detail.assignments")}
        </div>
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <div className="font-medium">{assignment.plan_id}</div>
            <div className="text-muted-foreground">
              {assignment.status} / {assignment.effective_from}
            </div>
          </div>
        ))}
        {assignments.length === 0 ? (
          <EmptyState
            title={t("system.users.detail.assignmentsEmpty")}
            detail={t("system.users.detail.assignmentsEmptyDescription", {
              email: user.email,
            })}
          />
        ) : null}
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HardDriveIcon className="size-4 text-muted-foreground" />
          {t("system.users.detail.workspace")}
        </div>
        {workspaceUsage.map((item) => (
          <div
            key={item.workspace_id}
            className="grid gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="font-medium">{item.workspace_name}</div>
              <div className="text-muted-foreground">
                {t("system.users.detail.workspaceSummary", {
                  type: item.workspace_type,
                  plan: item.plan_id,
                  objects: item.object_count,
                  versions: item.version_count,
                })}
              </div>
            </div>
            <div className="text-right">
              <div>{formatWorkspaceStorage(item)}</div>
              <div className="text-xs text-muted-foreground">
                {t("system.users.detail.recalculated", {
                  date: formatDateTime(item.recalculated_at),
                })}
              </div>
            </div>
          </div>
        ))}
        {workspaceUsage.length === 0 ? (
          <EmptyState
            title={t("system.users.detail.workspaceEmpty")}
            detail={t("system.users.detail.workspaceEmptyDescription")}
          />
        ) : null}
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GaugeIcon className="size-4 text-muted-foreground" />
          {t("system.users.detail.monthly")}
        </div>
        {usage.map((item) => (
          <div
            key={item.period_yyyymm}
            className="grid gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="font-medium">{item.period_yyyymm}</div>
              <div className="text-muted-foreground">
                {t("system.users.detail.tokenCount", {
                  count: formatMetricNumber(item.raw_total_tokens),
                })}
              </div>
            </div>
            <div className="text-right">
              {t("system.users.detail.creditCount", {
                count: item.charged_credits.toFixed(4),
              })}
            </div>
          </div>
        ))}
        {usage.length === 0 ? (
          <EmptyState
            title={t("system.users.detail.monthlyEmpty")}
            detail={t("system.users.detail.monthlyEmptyDescription")}
          />
        ) : null}
      </div>
    </div>
  );
}

function buildUserUsageTrend(usage: AdminUserMonthlyUsage[]) {
  const rows = [...usage].sort((a, b) =>
    a.period_yyyymm.localeCompare(b.period_yyyymm),
  );
  const chartData: AppLineChartDatum[] = rows.slice(-12).map((item) => ({
    label: formatPeriod(item.period_yyyymm),
    credits: item.charged_credits,
    tokens: item.raw_total_tokens,
  }));
  const chartSeries: AppLineChartSeries[] = [
    {
      key: "credits",
      label: i18n.t("system.users.chart.credits"),
      color: "var(--chart-1)",
    },
    {
      key: "tokens",
      label: i18n.t("system.users.chart.tokens"),
      color: "var(--chart-2)",
    },
  ];
  return { chartData, chartSeries };
}

function buildUserRiskItems(
  assignments: AdminUserPlanAssignment[],
  usage: AdminUserMonthlyUsage[],
  workspaceUsage: AdminWorkspaceUsage[],
) {
  const activePlanId = getActiveUserPlanId(assignments);
  const maxWorkspaceRatio = workspaceUsage.reduce((max, item) => {
    if (item.storage_usage_ratio == null) return max;
    return Math.max(max, item.storage_usage_ratio);
  }, 0);
  const sortedUsage = [...usage].sort((a, b) =>
    a.period_yyyymm.localeCompare(b.period_yyyymm),
  );
  const latest = sortedUsage.at(-1)?.charged_credits ?? 0;
  const previous = sortedUsage.at(-2)?.charged_credits ?? 0;
  const growth =
    previous > 0 ? Math.round(((latest - previous) / previous) * 100) : null;

  return [
    {
      label: activePlanId
        ? i18n.t("system.users.risk.planOk")
        : i18n.t("system.users.risk.planMissing"),
      detail: activePlanId
        ? i18n.t("system.users.risk.activePlan", { plan: activePlanId })
        : i18n.t("system.users.risk.noPlan"),
    },
    {
      label:
        maxWorkspaceRatio >= 0.9
          ? i18n.t("system.users.risk.workspaceHigh")
          : i18n.t("system.users.risk.workspaceOk"),
      detail:
        maxWorkspaceRatio > 0
          ? i18n.t("system.users.risk.maxStorage", {
              percent: Math.round(maxWorkspaceRatio * 100),
            })
          : i18n.t("system.users.risk.noRatio"),
    },
    {
      label:
        growth != null && growth > 50
          ? i18n.t("system.users.risk.growthHigh")
          : i18n.t("system.users.risk.growthOk"),
      detail:
        growth == null
          ? i18n.t("system.users.risk.noComparison")
          : i18n.t("system.users.risk.growth", { percent: growth }),
    },
  ];
}

function formatWorkspaceStorage(item: AdminWorkspaceUsage) {
  if (item.storage_limit_bytes && item.storage_limit_bytes > 0) {
    const ratio =
      item.storage_usage_ratio == null
        ? item.storage_bytes / item.storage_limit_bytes
        : item.storage_usage_ratio;
    return `${Math.round(ratio * 100)}% · ${formatBytes(item.storage_bytes)} / ${formatBytes(item.storage_limit_bytes)}`;
  }
  return i18n.t("system.users.used", {
    value: formatBytes(item.storage_bytes),
  });
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${formatMetricNumber(value / 1024 / 1024 / 1024)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${formatMetricNumber(value / 1024 / 1024)} MB`;
  }
  if (value >= 1024) {
    return `${formatMetricNumber(value / 1024)} KB`;
  }
  return `${formatMetricNumber(value)} B`;
}

function formatMetricNumber(value: number) {
  return new Intl.NumberFormat(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
      maximumFractionDigits: value >= 10 ? 1 : 2,
    },
  ).format(value);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(
    normalizeLanguage(i18n.resolvedLanguage || i18n.language),
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function formatPeriod(period: string) {
  if (period.length !== 6) return period;
  return `${period.slice(0, 4)}-${period.slice(4)}`;
}
