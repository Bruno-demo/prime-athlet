"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, ShieldCheck, Users } from "lucide-react";
interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  adminRole: string | null;
  adminSource: "database" | "environment" | "none";
  adminDisabledByOverride: boolean;
}
interface AdminUsersPayload {
  users?: AdminUserRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  envOnlyAssignments?: Array<{ email: string; role: string }>;
  error?: string;
}
interface AdminAuditEvent {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: "success" | "failure" | "denied";
  message: string | null;
  createdAt: string;
}
interface AdminAuditPayload {
  events?: AdminAuditEvent[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}
interface AdminSecurityOpsPanelProps {
  csrfToken: string;
  canWrite: boolean;
}
const roleOptions = ["owner", "manager", "support", "analyst"] as const;
const auditStatusOptions = ["all", "success", "failure", "denied"] as const;
export function AdminSecurityOpsPanel({
  csrfToken,
  canWrite,
}: AdminSecurityOpsPanelProps) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersPagination, setUsersPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [usersQuery, setUsersQuery] = useState("");
  const [selectedRoleByEmail, setSelectedRoleByEmail] = useState<
    Record<string, string>
  >({});
  const [envOnlyAssignments, setEnvOnlyAssignments] = useState<
    Array<{ email: string; role: string }>
  >([]);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    pageSize: 15,
    total: 0,
    totalPages: 1,
  });
  const [auditQuery, setAuditQuery] = useState("");
  const [auditStatus, setAuditStatus] =
    useState<(typeof auditStatusOptions)[number]>("all");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(usersPagination.page));
      params.set("pageSize", String(usersPagination.pageSize));
      if (usersQuery.trim()) {
        params.set("q", usersQuery.trim());
      }
      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminUsersPayload;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load admin users.");
      }
      const nextUsers = body.users || [];
      setUsers(nextUsers);
      setUsersPagination({
        page: body.pagination?.page ?? usersPagination.page,
        pageSize: body.pagination?.pageSize ?? usersPagination.pageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });
      setEnvOnlyAssignments(body.envOnlyAssignments || []);
      setSelectedRoleByEmail((current) => {
        const next = { ...current };
        for (const user of nextUsers) {
          if (!next[user.email]) {
            next[user.email] = user.adminRole || "manager";
          }
        }
        return next;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load admin users.",
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, [usersPagination.page, usersPagination.pageSize, usersQuery]);
  const loadAuditLogs = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(auditPagination.page));
      params.set("pageSize", String(auditPagination.pageSize));
      params.set("status", auditStatus);
      if (auditQuery.trim()) {
        params.set("q", auditQuery.trim());
      }
      const response = await fetch(`/api/admin/audit?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminAuditPayload;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load audit logs.");
      }
      setAuditEvents(body.events || []);
      setAuditPagination({
        page: body.pagination?.page ?? auditPagination.page,
        pageSize: body.pagination?.pageSize ?? auditPagination.pageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load audit logs.",
      );
    } finally {
      setIsLoadingAudit(false);
    }
  }, [auditPagination.page, auditPagination.pageSize, auditQuery, auditStatus]);
  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);
  const mutateUserAccess = useCallback(
    async (payload: {
      action: "set-role" | "revoke-admin" | "force-logout";
      email: string;
      role?: string;
    }) => {
      if (!canWrite) {
        setErrorMessage(
          "Your role is read-only for admin security management.",
        );
        return;
      }
      if (!csrfToken) {
        setErrorMessage("Security token is not ready. Retry in a moment.");
        return;
      }
      const key = `${payload.action}:${payload.email}`;
      setActionKey(key);
      setErrorMessage(null);
      setNotice(null);
      try {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify(payload),
        });
        const body = (await response.json()) as {
          error?: string;
          revokedSessions?: number;
        };
        if (!response.ok) {
          throw new Error(body.error || "Unable to update admin user.");
        }
        await Promise.all([loadUsers(), loadAuditLogs()]);
        if (payload.action === "force-logout") {
          setNotice(
            `Sessions revoked for ${payload.email}: ${body.revokedSessions ?? 0}`,
          );
        } else if (payload.action === "revoke-admin") {
          setNotice(`Admin access revoked for ${payload.email}.`);
        } else {
          setNotice(`Admin role updated for ${payload.email}.`);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to update admin user.",
        );
      } finally {
        setActionKey(null);
      }
    },
    [canWrite, csrfToken, loadAuditLogs, loadUsers],
  );
  const usersSummary = useMemo(() => {
    if (usersPagination.total === 0) {
      return "No users found.";
    }
    const start = (usersPagination.page - 1) * usersPagination.pageSize + 1;
    const end = Math.min(usersPagination.total, start + users.length - 1);
    return `Showing ${start}-${end} of ${usersPagination.total} users`;
  }, [
    users.length,
    usersPagination.page,
    usersPagination.pageSize,
    usersPagination.total,
  ]);
  return (
    <div className="space-y-4">
      {notice ? (
        <p className="status-success rounded-xl px-3 py-2 text-sm">{notice}</p>
      ) : null}
      {errorMessage ? (
        <p className="status-error rounded-xl px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}
      <article className="surface-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="inline-flex items-center gap-2 text-lg font-semibold text-brand">
              <Users className="h-4 w-4 text-accent" /> Admin User Management
            </h4>
            <p className="mt-1 text-xs text-muted">
              Manage roles, revoke admin access, and force logout sessions.
            </p>
          </div>
          {isLoadingUsers ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading
              users...
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={usersQuery}
            onChange={(event) => {
              setUsersQuery(event.target.value);
              setUsersPagination((current) => ({ ...current, page: 1 }));
            }}
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            placeholder="Search users by email or name"
          />
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-secondary"
          >
            Refresh
          </button>
          <p className="inline-flex h-10 items-center text-xs text-muted">
            {usersSummary}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {users.map((user) => {
            const selectedRole =
              selectedRoleByEmail[user.email] || user.adminRole || "manager";
            return (
              <div
                key={`admin-user-${user.email}`}
                className="rounded-xl border border-brand/15 bg-surface p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-brand">
                      {user.displayName}
                    </p>
                    <p className="text-xs text-muted">{user.email}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Role: {user.adminRole || "none"} ({user.adminSource})
                      {user.adminDisabledByOverride
                        ? " - disabled by override"
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedRole}
                      onChange={(event) =>
                        setSelectedRoleByEmail((current) => ({
                          ...current,
                          [user.email]: event.target.value,
                        }))
                      }
                      className="themed-input h-9 rounded-lg px-2.5 text-xs focus:outline-none"
                      disabled={!canWrite}
                    >
                      {roleOptions.map((role) => (
                        <option key={`${user.email}-${role}`} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={
                        !canWrite || actionKey === `set-role:${user.email}`
                      }
                      onClick={() =>
                        void mutateUserAccess({
                          action: "set-role",
                          email: user.email,
                          role: selectedRole,
                        })
                      }
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-primary disabled:opacity-60"
                    >
                      {actionKey === `set-role:${user.email}`
                        ? "Saving..."
                        : "Save Role"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canWrite || actionKey === `revoke-admin:${user.email}`
                      }
                      onClick={() =>
                        void mutateUserAccess({
                          action: "revoke-admin",
                          email: user.email,
                        })
                      }
                      className="inline-flex h-9 items-center rounded-lg border border-[var(--status-warning-border)] px-3 text-xs font-semibold text-[var(--status-warning-text)] transition hover:bg-[var(--status-warning-bg)] disabled:opacity-60"
                    >
                      {actionKey === `revoke-admin:${user.email}`
                        ? "Revoking..."
                        : "Revoke Admin"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canWrite || actionKey === `force-logout:${user.email}`
                      }
                      onClick={() =>
                        void mutateUserAccess({
                          action: "force-logout",
                          email: user.email,
                        })
                      }
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-danger disabled:opacity-60"
                    >
                      {actionKey === `force-logout:${user.email}`
                        ? "Revoking..."
                        : "Force Logout"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setUsersPagination((current) => ({
                ...current,
                page: Math.max(1, current.page - 1),
              }))
            }
            disabled={usersPagination.page <= 1}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-50"
          >
            Previous
          </button>
          <p className="text-xs text-muted">
            Page {usersPagination.page} of {usersPagination.totalPages}
          </p>
          <button
            type="button"
            onClick={() =>
              setUsersPagination((current) => ({
                ...current,
                page: Math.min(current.totalPages, current.page + 1),
              }))
            }
            disabled={usersPagination.page >= usersPagination.totalPages}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
        {envOnlyAssignments.length > 0 ? (
          <div className="mt-4 rounded-xl border border-brand/15 bg-surface-soft p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
              Environment-managed admins (not in users collection)
            </p>
            <div className="mt-2 space-y-1">
              {envOnlyAssignments.map((assignment) => (
                <p
                  key={`env-assignment-${assignment.email}`}
                  className="text-xs text-muted"
                >
                  {assignment.email} - {assignment.role}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </article>
      <article className="surface-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="inline-flex items-center gap-2 text-lg font-semibold text-brand">
              <ShieldCheck className="h-4 w-4 text-accent" /> Immutable Audit
              Log
            </h4>
            <p className="mt-1 text-xs text-muted">
              Security and admin mutations are tracked with actor, action, and
              status.
            </p>
          </div>
          {isLoadingAudit ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading
              logs...
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={auditQuery}
            onChange={(event) => {
              setAuditQuery(event.target.value);
              setAuditPagination((current) => ({ ...current, page: 1 }));
            }}
            placeholder="Search audit log"
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
          />
          <select
            value={auditStatus}
            onChange={(event) => {
              setAuditStatus(
                event.target.value as (typeof auditStatusOptions)[number],
              );
              setAuditPagination((current) => ({ ...current, page: 1 }));
            }}
            className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
          >
            {auditStatusOptions.map((status) => (
              <option key={`audit-status-${status}`} value={status}>
                Status: {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadAuditLogs()}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-secondary"
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {auditEvents.length === 0 ? (
            <p className="rounded-xl border border-brand/15 bg-surface p-3 text-xs text-muted">
              No audit events found for the current filter.
            </p>
          ) : null}
          {auditEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-brand/15 bg-surface p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-brand">
                  {event.action}
                </p>
                <p className="text-[11px] text-muted">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                Actor: {event.actorEmail || "unknown"}
                {event.actorRole ? `(${event.actorRole})` : ""}
              </p>
              <p className="text-xs text-muted">
                Resource: {event.resourceType}
                {event.resourceId ? ` • ${event.resourceId}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted">
                Status:
                <span className="font-semibold text-brand">{event.status}</span>
                {event.message ? ` • ${event.message}` : ""}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setAuditPagination((current) => ({
                ...current,
                page: Math.max(1, current.page - 1),
              }))
            }
            disabled={auditPagination.page <= 1}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-50"
          >
            Previous
          </button>
          <p className="text-xs text-muted">
            Page {auditPagination.page} of {auditPagination.totalPages}
          </p>
          <button
            type="button"
            onClick={() =>
              setAuditPagination((current) => ({
                ...current,
                page: Math.min(current.totalPages, current.page + 1),
              }))
            }
            disabled={auditPagination.page >= auditPagination.totalPages}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </article>
    </div>
  );
}
