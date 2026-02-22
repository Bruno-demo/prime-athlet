"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Tags } from "lucide-react";
type TaxonomyType = "sport" | "category";
type TaxonomyAction = "create" | "rename" | "delete";
interface TaxonomyItemPayload {
  id: string;
  type: TaxonomyType;
  slug: string;
  value: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}
interface TaxonomyResponse {
  sports?: TaxonomyItemPayload[];
  categories?: TaxonomyItemPayload[];
  error?: string;
}
interface TaxonomyMutationResponse {
  success?: boolean;
  renamedProducts?: number;
  deleted?: boolean;
  error?: string;
}
interface AdminTaxonomyPanelProps {
  csrfToken: string;
  canWrite: boolean;
  onAfterMutation?: () => Promise<void> | void;
}
function labelForType(type: TaxonomyType): string {
  return type === "sport" ? "Sports" : "Categories";
}
export function AdminTaxonomyPanel({
  csrfToken,
  canWrite,
  onAfterMutation,
}: AdminTaxonomyPanelProps) {
  const [sports, setSports] = useState<TaxonomyItemPayload[]>([]);
  const [categories, setCategories] = useState<TaxonomyItemPayload[]>([]);
  const [newSport, setNewSport] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [draftValuesById, setDraftValuesById] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const allItems = useMemo(
    () => [...sports, ...categories],
    [categories, sports],
  );
  const loadTaxonomy = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/taxonomy", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as TaxonomyResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load taxonomy.");
      }
      const nextSports = body.sports || [];
      const nextCategories = body.categories || [];
      setSports(nextSports);
      setCategories(nextCategories);
      setDraftValuesById((current) => {
        const next = { ...current };
        for (const item of [...nextSports, ...nextCategories]) {
          if (!next[item.id]) {
            next[item.id] = item.value;
          }
        }
        return next;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load taxonomy.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadTaxonomy();
  }, [loadTaxonomy]);
  const mutate = useCallback(
    async (params: {
      action: TaxonomyAction;
      type: TaxonomyType;
      value: string;
      nextValue?: string;
      key: string;
    }) => {
      if (!canWrite) {
        setErrorMessage("Your role is read-only for taxonomy management.");
        return;
      }
      if (!csrfToken) {
        setErrorMessage("Security token is not ready. Retry in a moment.");
        return;
      }
      setActionKey(params.key);
      setErrorMessage(null);
      setNotice(null);
      try {
        const response = await fetch("/api/admin/taxonomy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            action: params.action,
            type: params.type,
            value: params.value,
            nextValue: params.nextValue,
          }),
        });
        const body = (await response.json()) as TaxonomyMutationResponse;
        if (!response.ok || !body.success) {
          throw new Error(body.error || "Unable to update taxonomy.");
        }
        await loadTaxonomy();
        if (onAfterMutation) {
          await onAfterMutation();
        }
        if (params.action === "rename") {
          setNotice(
            `Renamed ${params.type} "${params.value}" to "${params.nextValue}" (${body.renamedProducts ?? 0} products updated).`,
          );
        } else if (params.action === "delete") {
          setNotice(`Deleted ${params.type} "${params.value}".`);
        } else {
          setNotice(`Added ${params.type} "${params.value}".`);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to update taxonomy.",
        );
      } finally {
        setActionKey(null);
      }
    },
    [canWrite, csrfToken, loadTaxonomy, onAfterMutation],
  );
  const renderTypePanel = (
    type: TaxonomyType,
    items: TaxonomyItemPayload[],
  ) => {
    const createValue = type === "sport" ? newSport : newCategory;
    const setCreateValue = type === "sport" ? setNewSport : setNewCategory;
    return (
      <div className="rounded-2xl border border-brand/15 bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-semibold text-brand">
            {labelForType(type)}
          </h4>
          <p className="text-xs text-muted">{items.length} total</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={createValue}
            onChange={(event) => setCreateValue(event.target.value)}
            placeholder={`Add ${type}`}
            className="themed-input h-9 min-w-0 flex-1 rounded-lg px-2.5 text-sm focus:outline-none"
          />
          <button
            type="button"
            disabled={!canWrite || !createValue.trim() || Boolean(actionKey)}
            onClick={() => {
              const value = createValue.trim();
              void mutate({
                action: "create",
                type,
                value,
                key: `create:${type}:${value}`,
              });
              setCreateValue("");
            }}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-primary disabled:opacity-60"
          >
            Add
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {items.length === 0 ? (
            <p className="rounded-xl border border-brand/15 bg-surface-soft px-3 py-2 text-xs text-muted">
              No items yet.
            </p>
          ) : null}
          {items.map((item) => {
            const draftValue = draftValuesById[item.id] || item.value;
            const renameKey = `rename:${type}:${item.id}`;
            const deleteKey = `delete:${type}:${item.id}`;
            const isRenamePending = actionKey === renameKey;
            const isDeletePending = actionKey === deleteKey;
            const canDelete = item.usageCount === 0;
            const hasChanged = draftValue.trim() !== item.value;
            return (
              <div
                key={`${type}-${item.id}`}
                className="rounded-xl border border-brand/15 bg-surface-soft p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <input
                    value={draftValue}
                    onChange={(event) =>
                      setDraftValuesById((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    className="themed-input h-9 rounded-lg px-2.5 text-sm focus:outline-none"
                    disabled={!canWrite}
                  />
                  <button
                    type="button"
                    disabled={!canWrite || !hasChanged || Boolean(actionKey)}
                    onClick={() =>
                      void mutate({
                        action: "rename",
                        type,
                        value: item.value,
                        nextValue: draftValue.trim(),
                        key: renameKey,
                      })
                    }
                    className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-60"
                  >
                    {isRenamePending ? "Saving..." : "Rename"}
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || !canDelete || Boolean(actionKey)}
                    onClick={() =>
                      void mutate({
                        action: "delete",
                        type,
                        value: item.value,
                        key: deleteKey,
                      })
                    }
                    title={
                      canDelete
                        ? `Delete ${item.value}`
                        : `Cannot delete while used by ${item.usageCount} products`
                    }
                    className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold btn-danger disabled:opacity-60"
                  >
                    {isDeletePending ? "Deleting..." : "Delete"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Usage: {item.usageCount} product
                  {item.usageCount === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <article className="surface-card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-brand">
            <Tags className="h-4 w-4 text-accent" /> Catalog Taxonomy (Sports &
            Categories)
          </h3>
          <p className="mt-1 text-xs text-muted">
            CRUD taxonomy values and keep product classification consistent.
          </p>
        </div>
        {isLoading ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading...
          </p>
        ) : null}
      </div>
      {notice ? (
        <p className="mt-3 status-success rounded-xl px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 status-error rounded-xl px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {renderTypePanel("sport", sports)}
        {renderTypePanel("category", categories)}
      </div>
      <p className="mt-4 text-xs text-muted">
        Hardening rule: delete is blocked while a value is still referenced by
        products.
      </p>
      <p className="mt-1 text-xs text-muted">
        Total managed entries: {allItems.length}
      </p>
    </article>
  );
}
