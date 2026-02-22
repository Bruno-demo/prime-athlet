"use client";
import { FormEvent, useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { BillingProfile } from "@/lib/account-types";
interface BillingProfileFormProps {
  initialProfile: BillingProfile | null;
}
interface BillingResponsePayload {
  billingProfile?: BillingProfile | null;
  error?: string;
}
function getInitialValues(profile: BillingProfile | null): BillingProfile {
  return {
    fullName: profile?.fullName || "",
    company: profile?.company || "",
    phone: profile?.phone || "",
    line1: profile?.line1 || "",
    line2: profile?.line2 || "",
    city: profile?.city || "",
    state: profile?.state || "",
    postalCode: profile?.postalCode || "",
    country: profile?.country || "",
    taxId: profile?.taxId || "",
  };
}
export function BillingProfileForm({
  initialProfile,
}: BillingProfileFormProps) {
  const [formValues, setFormValues] = useState<BillingProfile>(
    getInitialValues(initialProfile),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fields = useMemo(
    () => [
      {
        key: "fullName",
        label: "Full name",
        required: true,
        autoComplete: "name",
      },
      {
        key: "company",
        label: "Company",
        required: false,
        autoComplete: "organization",
      },
      { key: "phone", label: "Phone", required: false, autoComplete: "tel" },
      {
        key: "line1",
        label: "Address line 1",
        required: true,
        autoComplete: "address-line1",
      },
      {
        key: "line2",
        label: "Address line 2",
        required: false,
        autoComplete: "address-line2",
      },
      {
        key: "city",
        label: "City",
        required: true,
        autoComplete: "address-level2",
      },
      {
        key: "state",
        label: "State / Province",
        required: true,
        autoComplete: "address-level1",
      },
      {
        key: "postalCode",
        label: "Postal code",
        required: true,
        autoComplete: "postal-code",
      },
      {
        key: "country",
        label: "Country",
        required: true,
        autoComplete: "country-name",
      },
      { key: "taxId", label: "Tax ID", required: false, autoComplete: "off" },
    ],
    [],
  );
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/account/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });
      const payload = (await response.json()) as BillingResponsePayload;
      if (!response.ok || !payload.billingProfile) {
        setErrorMessage(payload.error || "Could not save billing profile.");
        return;
      }
      setFormValues(getInitialValues(payload.billingProfile));
      setSuccessMessage("Billing profile updated successfully.");
    } catch {
      setErrorMessage("Could not save billing profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {field.label}
            </span>
            <input
              type="text"
              value={formValues[field.key as keyof BillingProfile]}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              autoComplete={field.autoComplete}
              required={field.required}
            />
          </label>
        ))}
      </div>
      {errorMessage ? (
        <p className="status-error rounded-lg px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="status-success rounded-lg px-3 py-2 text-sm">
          {successMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold btn-primary disabled:opacity-70"
      >
        {isSaving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save billing profile
      </button>
    </form>
  );
}
