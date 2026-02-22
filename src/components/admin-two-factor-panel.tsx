"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  KeyRound,
  LoaderCircle,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
interface AdminTwoFactorStatusResponse {
  isAdmin?: boolean;
  role?: string;
  permissions?: string[];
  requiresTwoFactor?: boolean;
  configured?: boolean;
  source?: "database" | "environment" | "none";
  hasDatabaseConfig?: boolean;
  encryptionConfigured?: boolean;
  backupCodesRemaining?: number;
  enabledAt?: string | null;
  updatedAt?: string | null;
  email?: string;
  error?: string;
}
interface SetupBeginResponse {
  setupToken?: string;
  secret?: string;
  otpauthUri?: string;
  qrDataUrl?: string;
  expiresInSeconds?: number;
  error?: string;
}
interface SetupMutationResponse {
  success?: boolean;
  backupCodes?: string[];
  error?: string;
}
interface SetupDraft {
  setupToken: string;
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  expiresInSeconds: number;
}
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
export function AdminTwoFactorPanel() {
  const [status, setStatus] = useState<AdminTwoFactorStatusResponse | null>(
    null,
  );
  const [setupDraft, setSetupDraft] = useState<SetupDraft | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [managementCode, setManagementCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/account/admin-2fa", {
      method: "GET",
      cache: "no-store",
    });
    const body = (await response.json()) as AdminTwoFactorStatusResponse;
    if (!response.ok) {
      throw new Error(body.error || "Unable to load admin 2FA status.");
    }
    setStatus(body);
  }, []);
  useEffect(() => {
    setIsLoading(true);
    setErrorMessage(null);
    setNotice(null);
    void refreshStatus()
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load admin security.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [refreshStatus]);
  const isConfigured = Boolean(status?.configured);
  const statusBadge = useMemo(() => {
    if (!status) {
      return "Loading";
    }
    if (!status.configured) {
      return "Not Configured";
    }
    return status.source === "database" ? "Database 2FA" : "Environment 2FA";
  }, [status]);
  const handleBeginSetup = useCallback(async () => {
    setErrorMessage(null);
    setNotice(null);
    setBackupCodes(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/account/admin-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin" }),
      });
      const body = (await response.json()) as SetupBeginResponse;
      if (
        !response.ok ||
        !body.setupToken ||
        !body.secret ||
        !body.otpauthUri ||
        !body.qrDataUrl
      ) {
        throw new Error(body.error || "Could not start 2FA setup.");
      }
      setSetupDraft({
        setupToken: body.setupToken,
        secret: body.secret,
        otpauthUri: body.otpauthUri,
        qrDataUrl: body.qrDataUrl,
        expiresInSeconds: body.expiresInSeconds || 600,
      });
      setNotice(
        "Scan the QR code, then enter your authenticator code to enable 2FA.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not start 2FA setup.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, []);
  const handleEnableSetup = useCallback(async () => {
    if (!setupDraft) {
      setErrorMessage("Start setup first.");
      return;
    }
    if (!verificationCode.trim()) {
      setErrorMessage("Enter your authenticator code.");
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/account/admin-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          setupToken: setupDraft.setupToken,
          verificationCode: verificationCode.trim(),
        }),
      });
      const body = (await response.json()) as SetupMutationResponse;
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Could not enable 2FA.");
      }
      setBackupCodes(body.backupCodes || []);
      setSetupDraft(null);
      setVerificationCode("");
      setNotice(
        "Admin 2FA enabled. Store backup codes in a secure password manager.",
      );
      await refreshStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not enable 2FA.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [refreshStatus, setupDraft, verificationCode]);
  const handleRegenerateBackupCodes = useCallback(async () => {
    if (!managementCode.trim()) {
      setErrorMessage("Enter your authenticator or backup code.");
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/account/admin-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerate-backup-codes",
          verificationCode: managementCode.trim(),
        }),
      });
      const body = (await response.json()) as SetupMutationResponse;
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Could not regenerate backup codes.");
      }
      setBackupCodes(body.backupCodes || []);
      setManagementCode("");
      setNotice(
        "Backup codes regenerated. Previous backup codes are now invalid.",
      );
      await refreshStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not regenerate backup codes.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [managementCode, refreshStatus]);
  const handleDisable = useCallback(async () => {
    if (!managementCode.trim()) {
      setErrorMessage("Enter your authenticator or backup code.");
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/account/admin-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          verificationCode: managementCode.trim(),
        }),
      });
      const body = (await response.json()) as SetupMutationResponse;
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Could not disable 2FA.");
      }
      setSetupDraft(null);
      setBackupCodes(null);
      setManagementCode("");
      setNotice("Admin 2FA disabled for this account.");
      await refreshStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not disable 2FA.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [managementCode, refreshStatus]);
  if (isLoading) {
    return (
      <section className="glass-card rounded-3xl p-6 sm:p-7">
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading admin
          security...
        </p>
      </section>
    );
  }
  if (!status?.isAdmin) {
    return null;
  }
  return (
    <section className="glass-card rounded-3xl p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
            <ShieldCheck className="h-5 w-5 text-accent" /> Admin Security
          </h2>
          <p className="mt-2 text-sm text-muted">
            Protect your admin account with authenticator-based 2FA and one-time
            backup codes.
          </p>
        </div>
        <span className="status-info rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]">
          {statusBadge}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
            Role
          </p>
          <p className="mt-1 text-sm font-semibold text-brand">
            {status.role || "admin"}
          </p>
        </div>
        <div className="surface-card rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
            2FA Required
          </p>
          <p className="mt-1 text-sm font-semibold text-brand">
            {status.requiresTwoFactor ? "Yes" : "No"}
          </p>
        </div>
        <div className="surface-card rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
            Backup Codes Left
          </p>
          <p className="mt-1 text-sm font-semibold text-brand">
            {status.backupCodesRemaining ?? 0}
          </p>
        </div>
        <div className="surface-card rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
            Enabled
          </p>
          <p className="mt-1 text-sm font-semibold text-brand">
            {status.enabledAt
              ? new Date(status.enabledAt).toLocaleString()
              : "Not enabled"}
          </p>
        </div>
      </div>
      {notice ? (
        <p className="mt-4 status-success rounded-xl px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-4 status-error rounded-xl px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}
      {!status.encryptionConfigured ? (
        <p className="mt-4 status-warning rounded-xl px-3 py-2 text-sm">
          Set <code>ADMIN_2FA_ENCRYPTION_KEY</code> in <code>.env.local</code>
          before enabling admin 2FA setup.
        </p>
      ) : null}
      {!isConfigured ? (
        <div className="mt-5 rounded-2xl border border-brand/15 bg-surface-soft p-4">
          <p className="text-sm font-semibold text-brand">Enable Admin 2FA</p>
          <p className="mt-1 text-xs text-muted">
            Start setup to generate your QR code and manual setup key.
          </p>
          <button
            type="button"
            onClick={handleBeginSetup}
            disabled={isSubmitting || !status.encryptionConfigured}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-60"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            Start Setup
          </button>
        </div>
      ) : null}
      {setupDraft ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-brand/15 bg-surface-soft p-4">
          <p className="text-sm font-semibold text-brand">
            Scan With Authenticator App
          </p>
          <Image
            src={setupDraft.qrDataUrl}
            alt="Admin 2FA QR code"
            width={192}
            height={192}
            unoptimized
            className="h-48 w-48 rounded-xl border border-brand/15 bg-surface p-2"
          />
          <div className="rounded-xl border border-brand/15 bg-surface p-3 text-xs text-muted">
            <p className="font-semibold text-brand">Manual setup key</p>
            <p className="mt-1 break-all">{setupDraft.secret}</p>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyText(setupDraft.secret);
                setNotice(copied ? "Secret copied." : "Unable to copy secret.");
              }}
              className="mt-2 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold btn-secondary"
            >
              <Copy className="h-3.5 w-3.5" /> Copy key
            </button>
          </div>
          <label className="block">
            <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Verification Code
            </span>
            <input
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="123456"
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={handleEnableSetup}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-60"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Verify and Enable
          </button>
        </div>
      ) : null}
      {isConfigured ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-brand/15 bg-surface-soft p-4">
          <p className="text-sm font-semibold text-brand">Manage 2FA</p>
          <p className="text-xs text-muted">
            Enter an authenticator code or an unused backup code to regenerate
            backup codes or disable admin 2FA.
          </p>
          <input
            value={managementCode}
            onChange={(event) => setManagementCode(event.target.value)}
            placeholder="Authenticator or backup code"
            className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRegenerateBackupCodes}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary disabled:opacity-60"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Regenerate Backup Codes
            </button>
            <button
              type="button"
              onClick={handleDisable}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-danger disabled:opacity-60"
            >
              <ShieldOff className="h-4 w-4" /> Disable 2FA
            </button>
          </div>
        </div>
      ) : null}
      {backupCodes && backupCodes.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--status-warning-text)]">
            <KeyRound className="h-4 w-4" /> Backup Codes (save now)
          </p>
          <p className="mt-1 text-xs text-[var(--status-warning-text)]">
            Each code can be used once. These codes will not be shown again.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {backupCodes.map((code) => (
              <code
                key={code}
                className="rounded-lg border border-[var(--status-warning-border)] bg-surface px-3 py-2 text-sm font-semibold text-brand"
              >
                {code}
              </code>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              const copied = await copyText(backupCodes.join("\n"));
              setNotice(
                copied
                  ? "Backup codes copied."
                  : "Unable to copy backup codes.",
              );
            }}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold btn-secondary"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Backup Codes
          </button>
        </div>
      ) : null}
    </section>
  );
}
