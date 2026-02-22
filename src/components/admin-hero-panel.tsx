"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ImagePlus,
  LoaderCircle,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { HeroSlideRecord } from "@/lib/hero-slides";
import { IMAGE_PRESETS } from "@/lib/image-standards";
interface AdminHeroPanelProps {
  csrfToken: string;
  canWrite: boolean;
}
interface HeroListResponse {
  slides?: HeroSlideRecord[];
  error?: string;
}
interface HeroMutationResponse {
  success?: boolean;
  slide?: HeroSlideRecord;
  error?: string;
}
interface HeroFormState {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  sortOrder: number;
  isActive: boolean;
  image: { src: string; alt: string; width?: number; height?: number };
}
const heroPreset = IMAGE_PRESETS.hero;
const heroSortOptions = [
  0, 10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500,
];
function normalizeHeroId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
function createEmptyFormState(): HeroFormState {
  return {
    id: "",
    title: "",
    subtitle: "",
    badge: "Featured",
    href: "/shop",
    sortOrder: 100,
    isActive: true,
    image: { src: "", alt: "" },
  };
}
function toFormState(slide: HeroSlideRecord): HeroFormState {
  return {
    id: slide.id,
    title: slide.title,
    subtitle: slide.subtitle,
    badge: slide.badge,
    href: slide.href,
    sortOrder: slide.sortOrder,
    isActive: slide.isActive,
    image: {
      src: slide.image.src,
      alt: slide.image.alt,
      width: slide.image.width,
      height: slide.image.height,
    },
  };
}
async function measureImageFile(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      reject(new Error("Unable to measure image dimensions."));
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
}
export function AdminHeroPanel({ csrfToken, canWrite }: AdminHeroPanelProps) {
  const [slides, setSlides] = useState<HeroSlideRecord[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [form, setForm] = useState<HeroFormState>(createEmptyFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSlides = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/hero", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as HeroListResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load hero slides.");
      }
      setSlides(body.slides || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load hero slides.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadSlides();
  }, [loadSlides]);
  useEffect(() => {
    if (!selectedSlideId) {
      return;
    }
    const selected = slides.find((slide) => slide.id === selectedSlideId);
    if (selected) {
      setForm(toFormState(selected));
      return;
    }
    setSelectedSlideId(null);
    setForm(createEmptyFormState());
  }, [selectedSlideId, slides]);
  const summaryText = useMemo(() => {
    if (slides.length === 0) {
      return "No hero slides yet.";
    }
    const activeCount = slides.filter((slide) => slide.isActive).length;
    return `${slides.length} slides (${activeCount} active)`;
  }, [slides]);
  const handleReset = useCallback(() => {
    setForm(createEmptyFormState());
    setSelectedSlideId(null);
    setErrorMessage(null);
    setNotice(null);
  }, []);
  const handleUploadHeroImage = useCallback(
    async (file: File) => {
      if (!canWrite) {
        setErrorMessage("Your role is read-only for media updates.");
        return;
      }
      if (!csrfToken) {
        setErrorMessage(
          "Security token is initializing. Please retry in a moment.",
        );
        return;
      }
      setErrorMessage(null);
      setNotice(null);
      setIsUploading(true);
      try {
        const measured = await measureImageFile(file);
        if (
          measured.width !== heroPreset.exactWidth ||
          measured.height !== heroPreset.exactHeight
        ) {
          throw new Error(
            `Hero image must be exactly ${heroPreset.exactWidth}x${heroPreset.exactHeight}px.`,
          );
        }
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        uploadForm.append("preset", "hero");
        const response = await fetch("/api/admin/upload-image", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: uploadForm,
        });
        const body = (await response.json()) as {
          src?: string;
          width?: number;
          height?: number;
          error?: string;
        };
        if (!response.ok || !body.src) {
          throw new Error(body.error || "Hero image upload failed.");
        }
        setForm((current) => ({
          ...current,
          image: {
            src: body.src || "",
            alt:
              current.image.alt.trim().length > 0
                ? current.image.alt
                : `${current.title || "Hero"} banner image`,
            width:
              typeof body.width === "number"
                ? Math.floor(body.width)
                : current.image.width,
            height:
              typeof body.height === "number"
                ? Math.floor(body.height)
                : current.image.height,
          },
        }));
        setNotice("Hero image uploaded and validated.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Hero image upload failed.",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [canWrite, csrfToken],
  );
  const handleSave = useCallback(async () => {
    if (!canWrite) {
      setErrorMessage("Your role is read-only for media updates.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage(
        "Security token is initializing. Please retry in a moment.",
      );
      return;
    }
    const id = normalizeHeroId(form.id || form.title);
    if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) {
      setErrorMessage(
        "Hero slide ID must be 2-120 characters using lowercase letters, numbers, and hyphens.",
      );
      return;
    }
    if (form.title.trim().length < 3 || form.title.trim().length > 120) {
      setErrorMessage("Title must be between 3 and 120 characters.");
      return;
    }
    if (form.subtitle.trim().length < 12 || form.subtitle.trim().length > 280) {
      setErrorMessage("Subtitle must be between 12 and 280 characters.");
      return;
    }
    if (form.badge.trim().length < 2 || form.badge.trim().length > 40) {
      setErrorMessage("Badge must be between 2 and 40 characters.");
      return;
    }
    if (!form.href.trim().startsWith("/")) {
      setErrorMessage(
        "Hero link must be an internal path that starts with '/'.",
      );
      return;
    }
    if (!form.image.src.trim() || !form.image.alt.trim()) {
      setErrorMessage("Hero image source and alt text are required.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/hero", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          slide: {
            ...form,
            id,
            title: form.title.trim(),
            subtitle: form.subtitle.trim(),
            badge: form.badge.trim(),
            href: form.href.trim(),
            sortOrder: Math.min(
              Math.max(Math.floor(form.sortOrder), 0),
              10_000,
            ),
            image: {
              src: form.image.src.trim(),
              alt: form.image.alt.trim(),
              width: form.image.width,
              height: form.image.height,
            },
          },
        }),
      });
      const body = (await response.json()) as HeroMutationResponse;
      if (!response.ok || !body.slide) {
        throw new Error(body.error || "Unable to save hero slide.");
      }
      setForm(toFormState(body.slide));
      setSelectedSlideId(body.slide.id);
      await loadSlides();
      setNotice("Hero slide saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save hero slide.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [canWrite, csrfToken, form, loadSlides]);
  const handleDelete = useCallback(async () => {
    if (!selectedSlideId) {
      return;
    }
    if (!canWrite) {
      setErrorMessage("Your role is read-only for media updates.");
      return;
    }
    if (!csrfToken) {
      setErrorMessage(
        "Security token is initializing. Please retry in a moment.",
      );
      return;
    }
    const confirmed = window.confirm(
      `Delete hero slide "${selectedSlideId}"? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/hero", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ id: selectedSlideId }),
      });
      const body = (await response.json()) as HeroMutationResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to delete hero slide.");
      }
      handleReset();
      await loadSlides();
      setNotice("Hero slide deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete hero slide.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [canWrite, csrfToken, handleReset, loadSlides, selectedSlideId]);
  return (
    <article className="glass-card rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
            <Sparkles className="h-5 w-5 text-accent" /> Home Hero Content
          </h3>
          <p className="mt-1 text-sm text-muted">
            Manage homepage hero slides (server-driven). Required hero image
            size: {heroPreset.exactWidth}x{heroPreset.exactHeight}px.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void loadSlides();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
            title="Refresh hero slides"
          >
            {isLoading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary"
            title="Create a new hero slide"
          >
            <ImagePlus className="h-4 w-4" /> New Slide
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {summaryText}
      </p>
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
      <div className="admin-table-wrap admin-table-mobile mt-4">
        <table className="admin-table admin-table-pin-first admin-table-pin-last text-xs sm:text-sm">
          <thead>
            <tr>
              <th>Slide</th>
              <th className="hidden md:table-cell">Badge</th>
              <th className="hidden md:table-cell">Sort</th>
              <th>Status</th>
              <th className="hidden lg:table-cell">Link</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {slides.map((slide) => {
              const isSelected = selectedSlideId === slide.id;
              return (
                <tr
                  key={slide.id}
                  className={
                    isSelected
                      ? "bg-[color-mix(in_oklab,var(--brand-action)_14%,transparent)]"
                      : undefined
                  }
                >
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="overflow-hidden rounded-lg border border-brand/15 bg-surface-soft">
                        <Image
                          src={slide.image.src}
                          alt={slide.image.alt}
                          width={96}
                          height={44}
                          className="h-11 w-24 object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-brand">
                          {slide.title}
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted">
                          {slide.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell">{slide.badge}</td>
                  <td className="hidden md:table-cell">{slide.sortOrder}</td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${slide.isActive ? "bg-[var(--status-success-bg)] text-[var(--status-success-text)]" : "bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"}`}
                    >
                      {slide.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell">{slide.href}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlideId(slide.id);
                        setForm(toFormState(slide));
                        setErrorMessage(null);
                        setNotice(null);
                      }}
                      className={`inline-flex h-8 items-center rounded-lg border px-3 text-[11px] font-semibold transition ${isSelected ? "btn-primary" : "btn-secondary"}`}
                      title={`Edit hero slide ${slide.title}`}
                    >
                      {isSelected ? "Selected" : "Edit"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && slides.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted">
                  No custom hero slides yet. Create your first one below.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Slide ID
          </span>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={form.id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  id: normalizeHeroId(event.target.value),
                }))
              }
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              placeholder="running-weekend-deals"
              title="Unique hero slide key. Lowercase letters, numbers, and hyphens only."
            />
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  id: normalizeHeroId(current.title),
                }))
              }
              className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold btn-secondary"
              title="Auto-generate ID from title"
            >
              Auto from title
            </button>
          </div>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Title
            </span>
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Hero headline shown on homepage"
            />
          </label>
          <label className="block">
            <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Badge
            </span>
            <input
              value={form.badge}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  badge: event.target.value,
                }))
              }
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Short badge label shown above title"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Subtitle
          </span>
          <textarea
            value={form.subtitle}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                subtitle: event.target.value,
              }))
            }
            className="themed-input min-h-24 w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
            title="Supporting hero copy"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Link
            </span>
            <input
              value={form.href}
              onChange={(event) =>
                setForm((current) => ({ ...current, href: event.target.value }))
              }
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Destination path when user clicks hero CTA"
              placeholder="/shop"
            />
          </label>
          <label className="block">
            <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Sort Order
            </span>
            <select
              value={String(form.sortOrder)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: Number(event.target.value),
                }))
              }
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Lower values appear first in hero rotation"
            >
              {!heroSortOptions.includes(form.sortOrder) ? (
                <option value={String(form.sortOrder)}>{form.sortOrder}</option>
              ) : null}
              {heroSortOptions.map((value) => (
                <option key={`hero-sort-${value}`} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Status
            </span>
            <select
              value={form.isActive ? "active" : "inactive"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isActive: event.target.value === "active",
                }))
              }
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Choose whether this slide is active on homepage"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <Upload className="h-4 w-4 text-accent" /> Hero Image (
            {heroPreset.exactWidth}x{heroPreset.exactHeight}px)
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary ${canWrite ? "" : "pointer-events-none opacity-60"}`}
            >
              <Upload className="h-4 w-4" />
              {isUploading ? "Uploading..." : "Upload Hero Image"}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                className="hidden"
                disabled={!canWrite}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  await handleUploadHeroImage(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div className="image-frame relative h-24 rounded-xl">
              {form.image.src ? (
                <Image
                  src={form.image.src}
                  alt={form.image.alt || "Hero preview image"}
                  fill
                  sizes="192px"
                  className="image-fit-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted">
                  No image
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <input
                value={form.image.src}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    image: { ...current.image, src: event.target.value },
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                placeholder="/products/admin/hero-image.jpg"
                title="Hero image source path"
              />
              <input
                value={form.image.alt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    image: { ...current.image, alt: event.target.value },
                  }))
                }
                className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
                placeholder="Hero image alt text"
                title="Hero image alt text for accessibility"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSaving || !canWrite}
            onClick={handleSave}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-70"
            title="Save hero slide"
          >
            {isSaving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Slide
          </button>
          {selectedSlideId ? (
            <button
              type="button"
              disabled={isSaving || !canWrite}
              onClick={handleDelete}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-danger disabled:opacity-70"
              title="Delete selected hero slide"
            >
              <Trash2 className="h-4 w-4" /> Delete Slide
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
            title="Reset hero slide form"
          >
            Reset Form
          </button>
        </div>
      </div>
    </article>
  );
}
