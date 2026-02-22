"use client";
import Image from "next/image";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  FileCheck2,
  FolderOpen,
  Gauge,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Megaphone,
  MoonStar,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AdminOrdersPanel } from "@/components/admin-orders-panel";
import { AdminPromotionsPanel } from "@/components/admin-promotions-panel";
import { AdminReviewsPanel } from "@/components/admin-reviews-panel";
import { AdminSecurityOpsPanel } from "@/components/admin-security-ops-panel";
import { AdminShippingSettingsPanel } from "@/components/admin-shipping-settings-panel";
import { AdminSupportPanel } from "@/components/admin-support-panel";
import { AdminTaxonomyPanel } from "@/components/admin-taxonomy-panel";
import { AdminHeroPanel } from "@/components/admin-hero-panel";
import { BrandLogo } from "@/components/brand-logo";
import { useTheme } from "@/components/theme-context";
import {
  formatPrice,
  getDefaultProductColors,
  getDefaultProductSizes,
  Product,
  ProductTone,
} from "@/lib/catalog";
import { IMAGE_PRESETS } from "@/lib/image-standards";
interface AdminDashboardProps {
  adminEmail: string;
}
interface AdminSummaryPayload {
  products: { count: number; totalReviews: number; averageRating: number };
  orders: {
    totalOrders: number;
    activeOrders: number;
    completedOrders: number;
    failedOrders: number;
    totalRevenueCents: number;
  };
  timeSeries: {
    monthly: AdminTimeSeriesPoint[];
    daily: AdminTimeSeriesPoint[];
  };
  recentOrders: AdminRecentOrder[];
}
interface AdminTimeSeriesPoint {
  key: string;
  label: string;
  revenueCents: number;
  orderCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
}
type AdminOrderStatus = "created" | "completed" | "expired" | "payment_failed";
type AdminFulfillmentStatus = "unfulfilled" | "fulfilled" | "cancelled";
interface AdminRecentOrder {
  stripeSessionId: string;
  status: AdminOrderStatus;
  paymentStatus: string;
  customerEmail: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitAmountCents: number;
  }>;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number | null;
  currency: string;
  fulfillmentStatus: AdminFulfillmentStatus;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  refundId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface AdminCsrfResponse {
  token?: string;
  role?: string;
  permissions?: string[];
  error?: string;
}
type AdminDashboardPermission =
  | "admin:dashboard:read"
  | "admin:summary:read"
  | "admin:products:read"
  | "admin:products:write"
  | "admin:promotions:read"
  | "admin:promotions:write"
  | "admin:orders:read"
  | "admin:orders:write"
  | "admin:media:read"
  | "admin:media:write"
  | "admin:security:read"
  | "admin:security:write";
type ProductSortOption =
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "rating-desc"
  | "reviews-desc";
interface AdminProductsResponse {
  products?: Product[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters?: { sports?: string[]; categories?: string[]; badges?: string[] };
  error?: string;
}
interface AuditPayload {
  summary: {
    totalImages: number;
    compliantImages: number;
    nonCompliantImages: number;
    complianceRate: number;
  };
  issues: Array<{
    src: string;
    reason: string;
    width?: number;
    height?: number;
  }>;
}
interface UploadPayload {
  src: string;
  width: number;
  height: number;
}
interface FormImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}
interface ProductFormState {
  id: string;
  name: string;
  sport: string;
  category: string;
  priceCents: number;
  brand: string;
  sku: string;
  stockQuantity: number;
  compareAtPriceCents: number | null;
  tags: string[];
  sizes: string[];
  colors: string[];
  rating: number;
  reviews: number;
  badge: string;
  description: string;
  tone: ProductTone;
  images: FormImage[];
}
type AdminPanelId =
  | "overview"
  | "products"
  | "media"
  | "promotions"
  | "support"
  | "reports"
  | "settings";
const panelItems: Array<{
  id: AdminPanelId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "products", label: "Product", icon: FolderOpen },
  { id: "media", label: "Media", icon: ImagePlus },
  { id: "promotions", label: "Promotions", icon: Megaphone },
  { id: "support", label: "Support", icon: CircleHelp },
  { id: "reports", label: "Reports", icon: FileCheck2 },
  { id: "settings", label: "Settings", icon: Settings },
];
const panelDescriptions: Record<AdminPanelId, string> = {
  overview: "Live revenue, fulfillment health, and media compliance snapshots.",
  products:
    "Manage product catalog, metadata, media, and pagination-aware queries.",
  media: "Enforce exact image standards and audit catalog media compliance.",
  promotions:
    "Configure promotions, scheduling, scope, and stack/priority rules.",
  support: "Manage customer support tickets, priorities, and resolution notes.",
  reports:
    "Review operational history across orders, refunds, and customer reviews.",
  settings:
    "Control theme, taxonomy, permissions, and platform security operations.",
};
const toneOptions: ProductTone[] = [
  "field",
  "court",
  "street",
  "fitness",
  "outdoor",
];
const defaultSportOptions = ["Football", "Basketball", "Running", "Training"];
const defaultCategoryOptions = [
  "Footwear",
  "Apparel",
  "Accessories",
  "Equipment",
  "Recovery",
  "Bags",
];
const defaultBadgeOptions = [
  "New Drop",
  "Top Rated",
  "Best Seller",
  "Pro Match",
  "Limited",
  "Value Pick",
];
const ratingOptions = [3, 3.5, 4, 4.2, 4.5, 4.7, 4.8, 5];
const reviewCountOptions = [0, 10, 25, 50, 100, 200, 500, 1000];
const defaultSizeOptions = [
  "One Size",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "US 6",
  "US 7",
  "US 8",
  "US 9",
  "US 10",
  "US 11",
  "US 12",
];
const defaultColorOptions = [
  "Black",
  "White",
  "Blue",
  "Navy",
  "Red",
  "Green",
  "Gray",
  "Orange",
  "Purple",
  "Neon",
  "Pink",
  "Yellow",
  "Brown",
];
const productPageSizeOptions = [12, 24, 36, 48, 72];
const productSortOptions: Array<{ value: ProductSortOption; label: string }> = [
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "price-asc", label: "Price low-high" },
  { value: "price-desc", label: "Price high-low" },
  { value: "rating-desc", label: "Top rating" },
  { value: "reviews-desc", label: "Most reviews" },
];
const productImagePreset = IMAGE_PRESETS.product;
const PRODUCT_ID_MAX_LENGTH = 120;
function normalizeProductIdInput(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PRODUCT_ID_MAX_LENGTH);
}
function createProductIdFromName(name: string): string {
  return normalizeProductIdInput(name);
}
function isValidProductId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,119}$/.test(value);
}
function normalizeSkuInput(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ).slice(0, 12);
}
function addOptionToList(
  current: string[],
  value: string,
  max: number,
): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return current;
  }
  const next = Array.from(new Set([...current, normalized]));
  return next.slice(0, max);
}

function removeOptionFromList(current: string[], value: string): string[] {
  return current.filter((item) => item !== value);
}
function validateProductFormForSave(product: ProductFormState): string | null {
  if (!isValidProductId(product.id)) {
    return "Product ID must be 2-120 characters using lowercase letters, numbers, and hyphens.";
  }
  if (product.name.trim().length < 2) {
    return "Product name must be at least 2 characters.";
  }
  if (product.sport.trim().length < 2) {
    return "Select a valid sport.";
  }
  if (product.category.trim().length < 2) {
    return "Select a valid category.";
  }
  if (product.brand.trim().length < 2 || product.brand.trim().length > 80) {
    return "Brand must be between 2 and 80 characters.";
  }
  if (!/^[A-Z0-9][A-Z0-9-]{1,63}$/.test(product.sku)) {
    return "SKU must be 2-64 characters using uppercase letters, numbers, and hyphens.";
  }
  if (
    !Number.isInteger(product.stockQuantity) ||
    product.stockQuantity < 0 ||
    product.stockQuantity > 1_000_000
  ) {
    return "Stock quantity must be an integer between 0 and 1,000,000.";
  }
  if (product.compareAtPriceCents !== null) {
    if (
      !Number.isInteger(product.compareAtPriceCents) ||
      product.compareAtPriceCents < 100 ||
      product.compareAtPriceCents > 3_000_000
    ) {
      return "Compare-at price must be an integer between 100 and 3,000,000 cents.";
    }
    if (product.compareAtPriceCents <= product.priceCents) {
      return "Compare-at price must be higher than current price.";
    }
  }
  if (!Array.isArray(product.tags) || product.tags.length === 0) {
    return "Add at least one product tag.";
  }
  if (product.tags.length > 12) {
    return "A product can include up to 12 tags.";
  }
  if (product.tags.some((tag) => tag.length < 2 || tag.length > 32)) {
    return "Each tag must be between 2 and 32 characters.";
  }
  if (!Array.isArray(product.sizes) || product.sizes.length === 0) {
    return "Add at least one available size.";
  }
  if (product.sizes.length > 12) {
    return "A product can include up to 12 sizes.";
  }
  if (product.sizes.some((size) => size.length < 1 || size.length > 24)) {
    return "Each size must be between 1 and 24 characters.";
  }
  if (!Array.isArray(product.colors) || product.colors.length === 0) {
    return "Add at least one available color.";
  }
  if (product.colors.length > 12) {
    return "A product can include up to 12 colors.";
  }
  if (product.colors.some((color) => color.length < 2 || color.length > 24)) {
    return "Each color must be between 2 and 24 characters.";
  }
  if (product.badge.trim().length < 2) {
    return "Select a valid badge.";
  }
  if (product.description.trim().length < 12) {
    return "Description must be at least 12 characters.";
  }
  if (
    !Number.isInteger(product.priceCents) ||
    product.priceCents < 100 ||
    product.priceCents > 2_000_000
  ) {
    return "Price must be an integer between 100 and 2,000,000 cents.";
  }
  if (
    !Number.isFinite(product.rating) ||
    product.rating < 0 ||
    product.rating > 5
  ) {
    return "Rating must be between 0 and 5.";
  }
  if (!Number.isFinite(product.reviews) || product.reviews < 0) {
    return "Reviews must be zero or greater.";
  }
  if (!Array.isArray(product.images) || product.images.length === 0) {
    return "Add at least one product image before saving.";
  }
  if (product.images.length > 8) {
    return "A product can include up to 8 images.";
  }
  for (const image of product.images) {
    if (!image.src.trim() || !image.alt.trim()) {
      return "Each image must include both a source path and alt text.";
    }
  }
  return null;
}
function createEmptyFormState(): ProductFormState {
  return {
    id: "",
    name: "",
    sport: "",
    category: "",
    priceCents: 10000,
    brand: "Prime Athlete",
    sku: "",
    stockQuantity: 0,
    compareAtPriceCents: null,
    tags: ["New Drop"],
    sizes: ["One Size"],
    colors: ["Black"],
    rating: 4.5,
    reviews: 0,
    badge: "New Drop",
    description: "",
    tone: "street",
    images: [],
  };
}
function toFormState(product: Product): ProductFormState {
  return {
    id: product.id,
    name: product.name,
    sport: product.sport,
    category: product.category,
    priceCents: product.priceCents,
    brand: product.brand || "Prime Athlete",
    sku: product.sku || normalizeSkuInput(product.id),
    stockQuantity:
      typeof product.stockQuantity === "number"
        ? Math.max(0, Math.floor(product.stockQuantity))
        : 0,
    compareAtPriceCents:
      typeof product.compareAtPriceCents === "number"
        ? Math.floor(product.compareAtPriceCents)
        : null,
    tags:
      Array.isArray(product.tags) && product.tags.length > 0
        ? product.tags
        : [product.sport, product.category, product.badge],
    sizes:
      Array.isArray(product.sizes) && product.sizes.length > 0
        ? product.sizes
        : getDefaultProductSizes(product.category),
    colors:
      Array.isArray(product.colors) && product.colors.length > 0
        ? product.colors
        : getDefaultProductColors(product.sport, product.category),
    rating: product.rating,
    reviews: product.reviews,
    badge: product.badge,
    description: product.description,
    tone: product.tone,
    images: product.images.map((image) => ({
      src: image.src,
      alt: image.alt,
      width: image.width,
      height: image.height,
    })),
  };
}
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
function getRecentOrderTotalCents(order: AdminRecentOrder): number {
  if (typeof order.totalCents === "number" && order.totalCents >= 0) {
    return Math.floor(order.totalCents);
  }
  return Math.max(order.subtotalCents - order.discountCents, 0) + order.shippingCents;
}
function shortSessionId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
function getProductThumbnail(
  product: Product,
): { src: string; alt: string } | null {
  if (!Array.isArray(product.images) || product.images.length === 0) {
    return null;
  }
  const image = product.images[0];
  if (!image?.src) {
    return null;
  }
  return { src: image.src, alt: image.alt || `${product.name} thumbnail` };
}
function getInitialsFromEmail(email: string): string {
  const safe = email.trim().split("@")[0] || "admin";
  const parts = safe.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) {
    return "AD";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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
export function AdminDashboard({ adminEmail }: AdminDashboardProps) {
  const [activePanel, setActivePanel] = useState<AdminPanelId>("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<AdminSummaryPayload | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [form, setForm] = useState<ProductFormState>(createEmptyFormState);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [productQuery, setProductQuery] = useState("");
  const [productSportFilter, setProductSportFilter] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productSort, setProductSort] = useState<ProductSortOption>("name-asc");
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(24);
  const [productPagination, setProductPagination] = useState({
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 1,
  });
  const [productFilterOptions, setProductFilterOptions] = useState({
    sports: defaultSportOptions,
    categories: defaultCategoryOptions,
    badges: defaultBadgeOptions,
  });
  const [manualImageSrc, setManualImageSrc] = useState("");
  const [manualImageAlt, setManualImageAlt] = useState("");
  const [sizeDraft, setSizeDraft] = useState("");
  const [colorDraft, setColorDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [adminRole, setAdminRole] = useState<string>("admin");
  const [adminPermissions, setAdminPermissions] = useState<Set<string>>(
    new Set(),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const didInitialLoadRef = useRef(false);
  const productEditorSectionRef = useRef<HTMLElement | null>(null);
  const { theme, setTheme, toggleTheme } = useTheme();
  const [themeControlReady, setThemeControlReady] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const scrollToProductEditor = useCallback(() => {
    productEditorSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);
  const hasPermission = useCallback(
    (permission: AdminDashboardPermission): boolean =>
      adminPermissions.has(permission),
    [adminPermissions],
  );
  const loadProducts = useCallback(async () => {
    setIsProductsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(productPage));
      params.set("pageSize", String(productPageSize));
      params.set("sort", productSort);
      if (productQuery.trim()) {
        params.set("q", productQuery.trim());
      }
      if (productSportFilter.trim()) {
        params.set("sport", productSportFilter.trim());
      }
      if (productCategoryFilter.trim()) {
        params.set("category", productCategoryFilter.trim());
      }
      const response = await fetch(`/api/admin/products?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminProductsResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load products.");
      }
      setProducts(body.products || []);
      setProductPagination({
        page: body.pagination?.page ?? productPage,
        pageSize: body.pagination?.pageSize ?? productPageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });
      if (body.pagination?.page && body.pagination.page !== productPage) {
        setProductPage(body.pagination.page);
      }
      if (
        body.pagination?.pageSize &&
        body.pagination.pageSize !== productPageSize
      ) {
        setProductPageSize(body.pagination.pageSize);
      }
      setProductFilterOptions({
        sports:
          body.filters?.sports && body.filters.sports.length > 0
            ? body.filters.sports
            : defaultSportOptions,
        categories:
          body.filters?.categories && body.filters.categories.length > 0
            ? body.filters.categories
            : defaultCategoryOptions,
        badges:
          body.filters?.badges && body.filters.badges.length > 0
            ? body.filters.badges
            : defaultBadgeOptions,
      });
    } finally {
      setIsProductsLoading(false);
    }
  }, [
    productCategoryFilter,
    productPage,
    productPageSize,
    productQuery,
    productSort,
    productSportFilter,
  ]);
  const loadCsrfToken = useCallback(async () => {
    const response = await fetch("/api/admin/csrf", {
      method: "GET",
      cache: "no-store",
    });
    const body = (await response.json()) as AdminCsrfResponse;
    if (!response.ok || !body.token) {
      throw new Error(body.error || "Unable to initialize admin security.");
    }
    setCsrfToken(body.token);
    setAdminRole(body.role || "admin");
    setAdminPermissions(new Set(body.permissions || []));
  }, []);
  const loadSummary = useCallback(async () => {
    const response = await fetch("/api/admin/summary", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Unable to load summary.");
    }
    const body = (await response.json()) as AdminSummaryPayload;
    setSummary(body);
  }, []);
  const loadAudit = useCallback(async () => {
    const response = await fetch("/api/admin/image-audit", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Unable to audit images.");
    }
    const body = (await response.json()) as AuditPayload;
    setAudit(body);
  }, []);
  const refreshAll = useCallback(async () => {
    setErrorMessage(null);
    setNotice(null);
    setIsLoading(true);
    try {
      await Promise.all([
        loadProducts(),
        loadSummary(),
        loadAudit(),
        loadCsrfToken(),
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to refresh admin data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadAudit, loadCsrfToken, loadProducts, loadSummary]);
  useEffect(() => {
    if (didInitialLoadRef.current) {
      return;
    }
    didInitialLoadRef.current = true;
    void refreshAll();
  }, [refreshAll]);
  useEffect(() => {
    if (!didInitialLoadRef.current) {
      return;
    }
    setErrorMessage(null);
    void loadProducts().catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load products.",
      );
    });
  }, [loadProducts]);
  useEffect(() => {
    setThemeControlReady(true);
  }, []);
  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);
  const sportOptions = useMemo(() => {
    const options = new Set<string>([
      ...defaultSportOptions,
      ...productFilterOptions.sports,
    ]);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [productFilterOptions.sports]);
  const categoryOptions = useMemo(() => {
    const options = new Set<string>([
      ...defaultCategoryOptions,
      ...productFilterOptions.categories,
    ]);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [productFilterOptions.categories]);
  const sizeOptions = useMemo(() => {
    const options = new Set<string>([
      ...defaultSizeOptions,
      ...getDefaultProductSizes(form.category),
      ...form.sizes,
    ]);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [form.category, form.sizes]);
  const colorOptions = useMemo(() => {
    const options = new Set<string>([
      ...defaultColorOptions,
      ...getDefaultProductColors(form.sport, form.category),
      ...form.colors,
    ]);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [form.category, form.colors, form.sport]);
  const badgeOptions = useMemo(() => {
    const options = new Set<string>([
      ...defaultBadgeOptions,
      ...productFilterOptions.badges,
    ]);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [productFilterOptions.badges]);
  const completedOrderRate = useMemo(() => {
    const total = summary?.orders.totalOrders ?? 0;
    if (total === 0) {
      return 0;
    }
    return ((summary?.orders.completedOrders ?? 0) / total) * 100;
  }, [summary?.orders.completedOrders, summary?.orders.totalOrders]);
  const monthlyRevenueSeries = useMemo(
    () => summary?.timeSeries.monthly ?? [],
    [summary?.timeSeries.monthly],
  );
  const dailyOrderSeries = useMemo(
    () => summary?.timeSeries.daily ?? [],
    [summary?.timeSeries.daily],
  );
  const todaySalesCents = useMemo(() => {
    if (dailyOrderSeries.length === 0) {
      return 0;
    }
    return dailyOrderSeries[dailyOrderSeries.length - 1]?.revenueCents ?? 0;
  }, [dailyOrderSeries]);
  const highestRevenuePoint = useMemo(
    () =>
      monthlyRevenueSeries.reduce(
        (max, point) => Math.max(max, point.revenueCents),
        1,
      ),
    [monthlyRevenueSeries],
  );
  const highestDailyOrders = useMemo(
    () =>
      dailyOrderSeries.reduce(
        (max, point) => Math.max(max, point.orderCount),
        1,
      ),
    [dailyOrderSeries],
  );
  const complianceRate = audit?.summary.complianceRate ?? 0;
  const initials = getInitialsFromEmail(adminEmail);
  const activePanelItem =
    panelItems.find((item) => item.id === activePanel) || panelItems[0];
  const activePanelDescription = panelDescriptions[activePanel];
  const canWriteProducts = hasPermission("admin:products:write");
  const canWriteMedia = hasPermission("admin:media:write");
  const canReadSupport = hasPermission("admin:orders:read");
  const canWriteOrders = hasPermission("admin:orders:write");
  const canWriteSupport = hasPermission("admin:orders:write");
  const canWritePromotions = hasPermission("admin:promotions:write");
  const canWriteSecurity = hasPermission("admin:security:write");
  const showCatalogToolbar =
    activePanel === "overview" ||
    activePanel === "products" ||
    activePanel === "media";
  const selectProduct = useCallback(
    (product: Product) => {
      setSelectedProductId(product.id);
      setForm(toFormState(product));
      setSizeDraft("");
      setColorDraft("");
      setErrorMessage(null);
      setNotice(null);
      setActivePanel("products");
      window.setTimeout(() => {
        scrollToProductEditor();
      }, 0);
    },
    [scrollToProductEditor],
  );
  const resetProductForm = useCallback(() => {
    setForm(createEmptyFormState());
    setSelectedProductId(null);
    setManualImageSrc("");
    setManualImageAlt("");
    setSizeDraft("");
    setColorDraft("");
    setErrorMessage(null);
    setNotice(null);
  }, []);
  const openNewProductEditor = useCallback(() => {
    setActivePanel("products");
    setProductQuery("");
    setProductSportFilter("");
    setProductCategoryFilter("");
    setProductSort("name-asc");
    setProductPage(1);
    setProductPageSize(24);
    resetProductForm();
    window.setTimeout(() => {
      scrollToProductEditor();
    }, 0);
  }, [resetProductForm, scrollToProductEditor]);
  const handleUploadProductImage = useCallback(
    async (file: File) => {
      if (!canWriteMedia) {
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
          measured.width !== productImagePreset.exactWidth ||
          measured.height !== productImagePreset.exactHeight
        ) {
          throw new Error(
            `Image must be ${productImagePreset.exactWidth}x${productImagePreset.exactHeight}px.`,
          );
        }
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        uploadForm.append("preset", "product");
        const response = await fetch("/api/admin/upload-image", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: uploadForm,
        });
        const body = (await response.json()) as UploadPayload & {
          error?: string;
        };
        if (!response.ok || !body.src) {
          throw new Error(body.error || "Image upload failed.");
        }
        setForm((current) => ({
          ...current,
          images: [
            ...current.images,
            {
              src: body.src,
              alt: `${current.name || "Product"} image ${current.images.length + 1}`,
              width: body.width,
              height: body.height,
            },
          ],
        }));
        setNotice("Image uploaded and validated.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Upload failed.",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [canWriteMedia, csrfToken],
  );
  const handleAddManualImage = useCallback(() => {
    if (!manualImageSrc.trim() || !manualImageAlt.trim()) {
      setErrorMessage("Provide both image path and alt text.");
      return;
    }
    setForm((current) => ({
      ...current,
      images: [
        ...current.images,
        { src: manualImageSrc.trim(), alt: manualImageAlt.trim() },
      ],
    }));
    setManualImageSrc("");
    setManualImageAlt("");
    setErrorMessage(null);
  }, [manualImageAlt, manualImageSrc]);
  const handleSaveProduct = useCallback(async () => {
    if (!canWriteProducts) {
      setErrorMessage("Your role is read-only for product updates.");
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
    setIsSaving(true);
    try {
      const normalizedId = normalizeProductIdInput(form.id || form.name);
      if (!isValidProductId(normalizedId)) {
        throw new Error(
          "Product ID must be 2-120 characters using lowercase letters, numbers, and hyphens.",
        );
      }
      const normalizedSku = normalizeSkuInput(form.sku || normalizedId);
      const normalizedTags = Array.from(
        new Set(
          form.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
        ),
      ).slice(0, 12);
      const normalizedSizes = Array.from(
        new Set(
          form.sizes
            .map((size) => size.trim())
            .filter((size) => size.length > 0),
        ),
      ).slice(0, 12);
      const normalizedColors = Array.from(
        new Set(
          form.colors
            .map((color) => color.trim())
            .filter((color) => color.length > 0),
        ),
      ).slice(0, 12);
      const nextProduct = {
        ...form,
        id: normalizedId,
        sku: normalizedSku,
        tags: normalizedTags,
        sizes: normalizedSizes,
        colors: normalizedColors,
      };
      const validationError = validateProductFormForSave(nextProduct);
      if (validationError) {
        throw new Error(validationError);
      }
      if (
        form.id !== normalizedId ||
        form.sku !== normalizedSku ||
        normalizedTags.join("|") !== form.tags.join("|") ||
        normalizedSizes.join("|") !== form.sizes.join("|") ||
        normalizedColors.join("|") !== form.colors.join("|")
      ) {
        setForm((current) => ({
          ...current,
          id: normalizedId,
          sku: normalizedSku,
          tags: normalizedTags,
          sizes: normalizedSizes,
          colors: normalizedColors,
        }));
      }
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ product: nextProduct }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Could not save product.");
      }
      await Promise.all([loadProducts(), loadSummary(), loadAudit()]);
      setSelectedProductId(normalizedId);
      setNotice("Product saved successfully.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save product.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [canWriteProducts, csrfToken, form, loadAudit, loadProducts, loadSummary]);
  const handleDeleteProduct = useCallback(async () => {
    if (!selectedProductId) {
      return;
    }
    if (!canWriteProducts) {
      setErrorMessage("Your role is read-only for product updates.");
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
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ id: selectedProductId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Could not delete product.");
      }
      await Promise.all([loadProducts(), loadSummary(), loadAudit()]);
      resetProductForm();
      setNotice("Product deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete product.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    canWriteProducts,
    csrfToken,
    loadAudit,
    loadProducts,
    loadSummary,
    resetProductForm,
    selectedProductId,
  ]);
  return (
    <section className="admin-dashboard-shell overflow-hidden rounded-[1.5rem] border border-brand/15 sm:rounded-[2rem] lg:overflow-visible">
      <div className="min-h-[80vh] xl:flex xl:items-start">
        {isMobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[var(--overlay-black-45)] xl:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-label="Close admin navigation"
            title="Close admin navigation"
          />
        ) : null}
        <aside
          className={`admin-dashboard-sidebar fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[90vw] overflow-y-auto border-r border-brand/15 p-4 text-[var(--color-on-solid)] transition-transform duration-200 ease-out ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"} xl:relative xl:inset-auto xl:z-auto xl:w-[16.5rem] xl:min-w-[16.5rem] xl:translate-x-0 xl:self-start xl:border-b-0 xl:p-5 xl:sticky xl:top-4`}
        >
          <div className="mb-3 flex justify-end xl:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--overlay-white-24)] bg-[var(--overlay-white-12)] text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)]"
              aria-label="Close admin navigation"
              title="Close admin navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-2xl border border-[var(--overlay-white-20)] bg-[var(--overlay-white-12)] px-3 py-3">
            <BrandLogo size="sm" inverted />
            <h2 className="mt-1 text-xl font-semibold text-[var(--color-on-solid)]">
              Analytics Hub
            </h2>
            <p className="mt-1 text-xs text-[var(--color-on-solid-75)]">
              Commerce operations workspace
            </p>
          </div>
          <nav className="mt-5 space-y-4">
            <div>
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-on-solid-70)]">
                Admin Tools
              </p>
              <div className="mt-1.5 space-y-1.5">
                {panelItems
                  .filter((item) => item.id !== "settings")
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = activePanel === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActivePanel(item.id);
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`inline-flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-[var(--overlay-white-20)] text-[var(--color-on-solid)]" : "text-[var(--color-on-solid-85)] hover:bg-[var(--overlay-white-15)]"}`}
                        title={`Open ${item.label}`}
                      >
                        <Icon className="h-4 w-4" /> {item.label}
                      </button>
                    );
                  })}
              </div>
            </div>
            <div>
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-on-solid-70)]">
                Configuration
              </p>
              <div className="mt-1.5 space-y-1.5">
                {panelItems
                  .filter((item) => item.id === "settings")
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = activePanel === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActivePanel(item.id);
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`inline-flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-[var(--overlay-white-20)] text-[var(--color-on-solid)]" : "text-[var(--color-on-solid-85)] hover:bg-[var(--overlay-white-15)]"}`}
                        title={`Open ${item.label}`}
                      >
                        <Icon className="h-4 w-4" /> {item.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          </nav>
          <div className="mt-6 rounded-2xl border border-[var(--overlay-white-20)] bg-[var(--overlay-black-35)] p-3 text-xs text-[var(--color-on-solid-85)]">
            <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--color-on-solid-70)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Access Control
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-on-solid-75)]">
              Role: {adminRole}
            </p>
            <p className="mt-2 line-clamp-2 break-all font-semibold text-[var(--color-on-solid)]">
              {adminEmail}
            </p>
          </div>
        </aside>
        <div className="admin-dashboard-content min-w-0 p-4 sm:p-6 xl:flex-1 xl:p-6">
          <header className="admin-dashboard-topbar surface-card mb-5 rounded-2xl p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-surface-soft text-brand transition hover:border-brand hover:bg-surface xl:hidden"
                  aria-label="Open admin navigation"
                  title="Open admin navigation"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    {activePanelItem.label}
                  </p>
                  <h3 className="truncate text-xl font-semibold text-brand sm:text-2xl">
                    Dashboard Analytics
                  </h3>
                  <p className="mt-1 text-xs text-muted sm:text-sm">
                    {activePanelDescription}
                  </p>
                </div>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <span className="inline-flex items-center rounded-full border border-brand/15 bg-surface-soft px-3 py-1 text-xs font-semibold text-brand">
                  {adminRole}
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--brand-action)] text-xs font-bold text-[var(--color-on-solid)]">
                  {initials}
                </span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3">
              {showCatalogToolbar ? (
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={productQuery}
                    onChange={(event) => {
                      setProductQuery(event.target.value);
                      setProductPage(1);
                    }}
                    placeholder="Search products by name, id, sport, category"
                    className="themed-input h-10 w-full rounded-xl pl-9 pr-3 text-sm focus:outline-none"
                    title="Search catalog items by product fields"
                  />
                </div>
              ) : (
                <p className="rounded-xl border border-brand/15 bg-surface-soft px-3 py-2 text-xs text-muted">
                  Panel-specific filters and actions are available inside this
                  section.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  void refreshAll();
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary sm:w-auto"
                title="Refresh dashboard data"
              >
                <RefreshCcw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
              {showCatalogToolbar ? (
                <button
                  type="button"
                  onClick={openNewProductEditor}
                  disabled={!canWriteProducts}
                  data-testid="admin-new-product-button"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-60 sm:w-auto"
                  title="Create a new product record"
                >
                  <Sparkles className="h-4 w-4" /> New Product
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openNewProductEditor}
                  disabled={!canWriteProducts}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-60 sm:w-auto"
                  title="Open product editor"
                >
                  <Sparkles className="h-4 w-4" /> Go to Product Editor
                </button>
              )}
            </div>
          </header>
          {notice ? (
            <p className="mb-4 status-success rounded-xl px-3 py-2 text-sm">
              {notice}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mb-4 status-error rounded-xl px-3 py-2 text-sm">
              {errorMessage}
            </p>
          ) : null}
          <div key={activePanel} className="motion-panel">
            {activePanel === "overview" ? (
              <div className="space-y-5">
                <article className="surface-card rounded-3xl p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-action)] text-sm font-bold text-[var(--color-on-solid)]">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Welcome back
                      </p>
                      <h3 className="truncate text-2xl font-semibold text-brand">
                        {adminEmail}
                      </h3>
                    </div>
                    <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                      <div className="rounded-xl border border-brand/15 bg-surface-soft px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                          Today sales
                        </p>
                        <p className="mt-1 text-base font-semibold text-brand">
                          {formatPrice(todaySalesCents)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-brand/15 bg-surface-soft px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                          Performance
                        </p>
                        <p className="mt-1 text-base font-semibold text-brand">
                          {formatPercent(completedOrderRate)}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="surface-card rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">
                      Revenue
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-brand">
                      {formatPrice(summary?.orders.totalRevenueCents ?? 0)}
                    </p>
                  </article>
                  <article className="surface-card rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">
                      Total Orders
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-brand">
                      {summary?.orders.totalOrders ?? 0}
                    </p>
                  </article>
                  <article className="surface-card rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">
                      Products
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-brand">
                      {summary?.products.count ?? 0}
                    </p>
                  </article>
                  <article className="surface-card rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">
                      Image Compliance
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-brand">
                      {complianceRate.toFixed(1)}%
                    </p>
                  </article>
                </div>
                <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <article className="surface-card rounded-3xl p-5 sm:p-6">
                    <h3 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
                      <BarChart3 className="h-5 w-5 text-accent" /> Revenue
                      Updates
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      Overview of monthly revenue performance.
                    </p>
                    <div
                      className="mt-5 grid items-end gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(monthlyRevenueSeries.length, 1)}, minmax(0, 1fr))`,
                      }}
                    >
                      {monthlyRevenueSeries.map((point) => {
                        const barHeight = Math.max(
                          16,
                          Math.round(
                            (point.revenueCents / highestRevenuePoint) * 150,
                          ),
                        );
                        return (
                          <div key={`bar-${point.key}`} className="text-center">
                            <div className="mx-auto flex h-40 w-7 items-end rounded-lg bg-surface-soft p-1">
                              <div
                                className="w-full rounded-md bg-[linear-gradient(180deg,var(--accent)_0%,var(--brand-action)_100%)]"
                                style={{ height: `${barHeight}px` }}
                              />
                            </div>
                            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                              {point.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="admin-table-wrap admin-table-mobile mt-5">
                      <table className="admin-table admin-table-pin-first text-xs sm:text-sm">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th className="text-right">Revenue</th>
                            <th className="text-right">Orders</th>
                            <th className="hidden text-right sm:table-cell">
                              Completed
                            </th>
                            <th className="hidden text-right sm:table-cell">
                              Failed
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyRevenueSeries.map((point) => (
                            <tr key={`monthly-row-${point.key}`}>
                              <td>{point.label}</td>
                              <td className="text-right">
                                {formatPrice(point.revenueCents)}
                              </td>
                              <td className="text-right">{point.orderCount}</td>
                              <td className="hidden text-right sm:table-cell">
                                {point.completedCount}
                              </td>
                              <td className="hidden text-right sm:table-cell">
                                {point.failedCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <article className="surface-card rounded-3xl p-5">
                      <h3 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
                        <Gauge className="h-5 w-5 text-accent" /> Sales Overview
                      </h3>
                      <div className="mt-4 flex items-center gap-4">
                        <div
                          className="relative h-32 w-32 rounded-full"
                          style={{
                            background: `conic-gradient(var(--brand-action) ${Math.min(completedOrderRate, 100) * 3.6}deg, color-mix(in oklab, var(--brand) 24%, transparent) 0deg)`,
                          }}
                        >
                          <div className="absolute inset-3 grid place-items-center rounded-full bg-surface text-center">
                            <p className="text-xs uppercase tracking-[0.1em] text-muted">
                              Done
                            </p>
                            <p className="text-lg font-semibold text-brand">
                              {formatPercent(completedOrderRate)}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-muted">
                          <p>
                            Completed:
                            <span className="font-semibold text-brand">
                              {summary?.orders.completedOrders ?? 0}
                            </span>
                          </p>
                          <p>
                            Active:
                            <span className="font-semibold text-brand">
                              {summary?.orders.activeOrders ?? 0}
                            </span>
                          </p>
                          <p>
                            Failed:
                            <span className="font-semibold text-brand">
                              {summary?.orders.failedOrders ?? 0}
                            </span>
                          </p>
                        </div>
                      </div>
                    </article>
                    <article className="surface-card rounded-3xl p-5">
                      <h3 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
                        <ShieldCheck className="h-5 w-5 text-accent" /> Media
                        Health
                      </h3>
                      <p className="mt-2 text-sm text-muted">
                        {audit?.summary.compliantImages ?? 0}/
                        {audit?.summary.totalImages ?? 0} product images pass
                        exact size rules.
                      </p>
                      {audit && audit.issues.length > 0 ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-semibold text-[var(--status-warning-text)]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {audit.issues.length} image issues need action
                        </p>
                      ) : (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-1 text-xs font-semibold text-[var(--status-success-text)]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> All images
                          compliant
                        </p>
                      )}
                    </article>
                  </div>
                </div>
                <article className="surface-card rounded-3xl p-5 sm:p-6">
                  <h3 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
                    <FileCheck2 className="h-5 w-5 text-accent" /> Recent Orders
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Latest checkout sessions for fast operational visibility.
                  </p>
                  {summary?.recentOrders && summary.recentOrders.length > 0 ? (
                    <div className="admin-table-wrap admin-table-mobile mt-4">
                      <table className="admin-table admin-table-pin-first text-xs sm:text-sm">
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th className="hidden md:table-cell">Customer</th>
                            <th className="text-right">Total</th>
                            <th>Status</th>
                            <th className="hidden sm:table-cell">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.recentOrders.slice(0, 8).map((order) => (
                            <tr key={`summary-order-${order.stripeSessionId}`}>
                              <td className="font-mono text-[11px] sm:text-xs">
                                {shortSessionId(order.stripeSessionId)}
                              </td>
                              <td className="hidden truncate md:table-cell">
                                {order.customerEmail || "N/A"}
                              </td>
                              <td className="text-right">
                                {formatPrice(getRecentOrderTotalCents(order))}
                              </td>
                              <td>
                                <span className="inline-flex rounded-full border border-brand/20 bg-surface-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
                                  {order.status}
                                </span>
                              </td>
                              <td className="hidden sm:table-cell">
                                {new Date(order.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-brand/15 bg-surface p-3 text-sm text-muted">
                      No recent orders to display.
                    </p>
                  )}
                </article>
              </div>
            ) : null}
            {activePanel === "products" ? (
              <div className="grid gap-4">
                <article className="glass-card order-2 rounded-3xl p-5 sm:p-6">
                  <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                    <FolderOpen className="h-5 w-5 text-accent" /> Product
                    Library
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Select and edit an existing product or create a new one.
                  </p>
                  <button
                    type="button"
                    onClick={scrollToProductEditor}
                    className="mt-2 inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold btn-secondary"
                    title="Jump to Product Editor form"
                  >
                    Jump to editor
                  </button>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <select
                      value={productSportFilter}
                      onChange={(event) => {
                        setProductSportFilter(event.target.value);
                        setProductPage(1);
                      }}
                      className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
                    >
                      <option value="">All sports</option>
                      {sportOptions.map((sport) => (
                        <option key={`library-sport-${sport}`} value={sport}>
                          {sport}
                        </option>
                      ))}
                    </select>
                    <select
                      value={productCategoryFilter}
                      onChange={(event) => {
                        setProductCategoryFilter(event.target.value);
                        setProductPage(1);
                      }}
                      className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
                    >
                      <option value="">All categories</option>
                      {categoryOptions.map((category) => (
                        <option
                          key={`library-category-${category}`}
                          value={category}
                        >
                          {category}
                        </option>
                      ))}
                    </select>
                    <select
                      value={productSort}
                      onChange={(event) => {
                        setProductSort(event.target.value as ProductSortOption);
                        setProductPage(1);
                      }}
                      className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
                    >
                      {productSortOptions.map((option) => (
                        <option
                          key={`library-sort-${option.value}`}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={String(productPageSize)}
                      onChange={(event) => {
                        setProductPageSize(Number(event.target.value));
                        setProductPage(1);
                      }}
                      className="themed-input h-9 rounded-lg px-3 text-xs focus:outline-none"
                    >
                      {!productPageSizeOptions.includes(productPageSize) ? (
                        <option
                          value={String(productPageSize)}
                        >{`${productPageSize} / page`}</option>
                      ) : null}
                      {productPageSizeOptions.map((size) => (
                        <option
                          key={`library-page-size-${size}`}
                          value={String(size)}
                        >
                          {`${size} / page`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Showing
                    <span className="font-semibold text-brand">
                      {productPagination.total === 0
                        ? 0
                        : (productPagination.page - 1) *
                            productPagination.pageSize +
                          1}
                    </span>
                    -
                    <span className="font-semibold text-brand">
                      {productPagination.total === 0
                        ? 0
                        : Math.min(
                            productPagination.page * productPagination.pageSize,
                            productPagination.total,
                          )}
                    </span>
                    of
                    <span className="font-semibold text-brand">
                      {productPagination.total}
                    </span>
                    products
                  </p>
                  <div className="admin-table-wrap admin-table-mobile mt-4 max-h-[54rem]">
                    {isProductsLoading ? (
                      <p className="inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-surface px-3 py-2 text-sm text-muted">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Loading products...
                      </p>
                    ) : null}
                    {!isProductsLoading && products.length > 0 ? (
                      <table className="admin-table admin-table-pin-first admin-table-pin-last text-xs sm:text-sm">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th className="hidden lg:table-cell">Sport</th>
                            <th className="hidden lg:table-cell">Category</th>
                            <th className="text-right">Price</th>
                            <th className="hidden text-right md:table-cell">
                              Rating
                            </th>
                            <th className="hidden text-right md:table-cell">
                              Reviews
                            </th>
                            <th className="hidden xl:table-cell">Badge</th>
                            <th className="text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((product) => {
                            const isSelected = selectedProductId === product.id;
                            const thumbnail = getProductThumbnail(product);
                            return (
                              <tr
                                key={product.id}
                                className={
                                  isSelected
                                    ? "bg-[color-mix(in_oklab,var(--brand-action)_14%,transparent)]"
                                    : undefined
                                }
                              >
                                <td>
                                  <div className="flex items-center gap-2.5">
                                    <div className="overflow-hidden rounded-lg border border-brand/15 bg-surface-soft">
                                      {thumbnail ? (
                                        <Image
                                          src={thumbnail.src}
                                          alt={thumbnail.alt}
                                          width={48}
                                          height={48}
                                          className="h-12 w-12 object-contain bg-surface-soft p-1"
                                        />
                                      ) : (
                                        <div className="grid h-12 w-12 place-items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                                          No Img
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-brand">
                                        {product.name}
                                      </p>
                                      <p className="truncate font-mono text-[11px] text-muted">
                                        {product.id}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="hidden lg:table-cell">
                                  {product.sport}
                                </td>
                                <td className="hidden lg:table-cell">
                                  {product.category}
                                </td>
                                <td className="text-right font-semibold text-brand">
                                  {formatPrice(product.priceCents)}
                                </td>
                                <td className="hidden text-right md:table-cell">
                                  {product.rating.toFixed(1)}
                                </td>
                                <td className="hidden text-right md:table-cell">
                                  {product.reviews}
                                </td>
                                <td className="hidden xl:table-cell">
                                  {product.badge}
                                </td>
                                <td className="text-right">
                                  <button
                                    type="button"
                                    onClick={() => selectProduct(product)}
                                    className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition ${isSelected ? "btn-primary" : "btn-secondary"}`}
                                    title={`Edit ${product.name}`}
                                  >
                                    {isSelected ? "Selected" : "Edit"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : null}
                    {!isProductsLoading &&
                    products.length === 0 &&
                    !isLoading ? (
                      <p className="rounded-xl border border-brand/15 bg-surface p-4 text-sm text-muted">
                        No products matched your search.
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={
                        productPagination.page <= 1 || isProductsLoading
                      }
                      onClick={() =>
                        setProductPage((current) => Math.max(current - 1, 1))
                      }
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-60"
                    >
                      Previous
                    </button>
                    <p className="w-full text-center text-xs text-muted sm:w-auto">
                      Page
                      <span className="font-semibold text-brand">
                        {productPagination.page}
                      </span>
                      of
                      <span className="font-semibold text-brand">
                        {productPagination.totalPages}
                      </span>
                    </p>
                    <button
                      type="button"
                      disabled={
                        productPagination.page >=
                          productPagination.totalPages || isProductsLoading
                      }
                      onClick={() =>
                        setProductPage((current) =>
                          Math.min(current + 1, productPagination.totalPages),
                        )
                      }
                      className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-60"
                    >
                      Next
                    </button>
                  </div>
                </article>
                <article
                  ref={productEditorSectionRef}
                  className="glass-card order-1 rounded-3xl p-5 sm:p-6"
                >
                  <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                    <Save className="h-5 w-5 text-accent" /> Product Editor
                  </h3>
                  <div className="mt-4 grid gap-3">
                    <label className="block">
                      <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Product ID
                      </span>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={form.id}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              id: normalizeProductIdInput(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                          placeholder="pro-velocity-cleat"
                          title="Unique URL key. Lowercase letters, numbers, and hyphens only."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => {
                              const nextId = createProductIdFromName(
                                current.name,
                              );
                              return {
                                ...current,
                                id: nextId,
                                sku:
                                  current.sku.trim().length === 0
                                    ? normalizeSkuInput(nextId)
                                    : current.sku,
                              };
                            })
                          }
                          className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold btn-secondary"
                          title="Auto-generate Product ID from Product Name"
                        >
                          Auto from name
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        Tip: click &quot;Auto from name&quot; to generate a
                        valid ID quickly.
                      </p>
                    </label>
                    <label className="block">
                      <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Product Name
                      </span>
                      <input
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => {
                            const nextName = event.target.value;
                            const shouldAutoFillId =
                              current.id.trim().length === 0;
                            const shouldAutoFillSku =
                              current.sku.trim().length === 0;
                            const nextId = shouldAutoFillId
                              ? createProductIdFromName(nextName)
                              : current.id;
                            return {
                              ...current,
                              name: nextName,
                              id: nextId,
                              sku: shouldAutoFillSku
                                ? normalizeSkuInput(nextId)
                                : current.sku,
                            };
                          })
                        }
                        className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Brand
                        </span>
                        <input
                          value={form.brand}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              brand: event.target.value,
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                          placeholder="Prime Athlete"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          SKU
                        </span>
                        <input
                          value={form.sku}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sku: normalizeSkuInput(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                          placeholder="PA-RUNNER-X"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Tags (comma separated)
                      </span>
                      <input
                        value={form.tags.join(", ")}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            tags: parseTagInput(event.target.value),
                          }))
                        }
                        className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        placeholder="running, footwear, lightweight"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Available Sizes
                        </span>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <select
                            value={sizeDraft}
                            onChange={(event) => setSizeDraft(event.target.value)}
                            className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                            title="Choose a size to add"
                          >
                            <option value="">Select size</option>
                            {sizeOptions.map((size) => (
                              <option key={`product-size-${size}`} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (!sizeDraft) {
                                return;
                              }
                              setForm((current) => ({
                                ...current,
                                sizes: addOptionToList(current.sizes, sizeDraft, 12),
                              }));
                              setSizeDraft("");
                            }}
                            className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold btn-secondary"
                            title="Add selected size"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                sizes: getDefaultProductSizes(current.category),
                              }))
                            }
                            className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold btn-secondary"
                            title="Apply default sizes based on category"
                          >
                            Defaults
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          Use selector + Add (up to 12 sizes).
                        </p>
                        {form.sizes.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {form.sizes.map((size) => (
                              <button
                                key={`selected-size-${size}`}
                                type="button"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    sizes: removeOptionFromList(current.sizes, size),
                                  }))
                                }
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold btn-secondary"
                                title={`Remove size ${size}`}
                              >
                                {size}
                                <X className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Available Colors
                        </span>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <select
                            value={colorDraft}
                            onChange={(event) => setColorDraft(event.target.value)}
                            className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                            title="Choose a color to add"
                          >
                            <option value="">Select color</option>
                            {colorOptions.map((color) => (
                              <option key={`product-color-${color}`} value={color}>
                                {color}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (!colorDraft) {
                                return;
                              }
                              setForm((current) => ({
                                ...current,
                                colors: addOptionToList(current.colors, colorDraft, 12),
                              }));
                              setColorDraft("");
                            }}
                            className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold btn-secondary"
                            title="Add selected color"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                colors: getDefaultProductColors(
                                  current.sport,
                                  current.category,
                                ),
                              }))
                            }
                            className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-semibold btn-secondary"
                            title="Apply default colors based on sport/category"
                          >
                            Defaults
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          Use selector + Add (up to 12 colors).
                        </p>
                        {form.colors.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {form.colors.map((color) => (
                              <button
                                key={`selected-color-${color}`}
                                type="button"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    colors: removeOptionFromList(
                                      current.colors,
                                      color,
                                    ),
                                  }))
                                }
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold btn-secondary"
                                title={`Remove color ${color}`}
                              >
                                {color}
                                <X className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Sport
                        </span>
                        <select
                          value={form.sport}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sport: event.target.value,
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        >
                          <option value="">Select sport</option>
                          {form.sport && !sportOptions.includes(form.sport) ? (
                            <option value={form.sport}>{form.sport}</option>
                          ) : null}
                          {sportOptions.map((sport) => (
                            <option key={`sport-option-${sport}`} value={sport}>
                              {sport}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Category
                        </span>
                        <select
                          value={form.category}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              category: event.target.value,
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        >
                          <option value="">Select category</option>
                          {form.category &&
                          !categoryOptions.includes(form.category) ? (
                            <option value={form.category}>
                              {form.category}
                            </option>
                          ) : null}
                          {categoryOptions.map((category) => (
                            <option
                              key={`category-option-${category}`}
                              value={category}
                            >
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Price (cents)
                        </span>
                        <input
                          type="number"
                          min={100}
                          value={form.priceCents}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              priceCents: Number(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Rating
                        </span>
                        <select
                          value={form.rating}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              rating: Number(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        >
                          {!ratingOptions.includes(form.rating) ? (
                            <option value={form.rating}>
                              {form.rating.toFixed(1)}
                            </option>
                          ) : null}
                          {ratingOptions.map((rating) => (
                            <option
                              key={`rating-option-${rating}`}
                              value={rating}
                            >
                              {rating.toFixed(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Reviews
                        </span>
                        <select
                          value={form.reviews}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              reviews: Number(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        >
                          {!reviewCountOptions.includes(form.reviews) ? (
                            <option value={form.reviews}>{form.reviews}</option>
                          ) : null}
                          {reviewCountOptions.map((reviews) => (
                            <option
                              key={`review-option-${reviews}`}
                              value={reviews}
                            >
                              {reviews}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Compare-at Price (cents)
                        </span>
                        <input
                          type="number"
                          min={100}
                          step={1}
                          value={form.compareAtPriceCents ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              compareAtPriceCents:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                          placeholder="Optional strike-through price"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Stock Quantity
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={form.stockQuantity}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              stockQuantity: Number(event.target.value),
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Badge
                        </span>
                        <select
                          value={form.badge}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              badge: event.target.value,
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        >
                          <option value="">Select badge</option>
                          {form.badge && !badgeOptions.includes(form.badge) ? (
                            <option value={form.badge}>{form.badge}</option>
                          ) : null}
                          {badgeOptions.map((badge) => (
                            <option key={`badge-option-${badge}`} value={badge}>
                              {badge}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Tone
                        </span>
                        <select
                          value={form.tone}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              tone: event.target.value as ProductTone,
                            }))
                          }
                          className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                        >
                          {toneOptions.map((tone) => (
                            <option key={tone} value={tone}>
                              {tone}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Description
                      </span>
                      <textarea
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        className="themed-input min-h-24 w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                      />
                    </label>
                    <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
                      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        <ImagePlus className="h-4 w-4 text-accent" /> Product
                        Images ({productImagePreset.exactWidth}x
                        {productImagePreset.exactHeight}px)
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        At least one image is required before saving.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label
                          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary ${canWriteMedia ? "" : "pointer-events-none opacity-60"}`}
                        >
                          <Upload className="h-4 w-4" />
                          {isUploading ? "Uploading..." : "Upload File"}
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                            className="hidden"
                            disabled={!canWriteMedia}
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              if (!file) {
                                return;
                              }
                              await handleUploadProductImage(file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <div className="mt-3 space-y-2">
                        {form.images.map((image, imageIndex) => (
                          <div
                            key={`${image.src}-${imageIndex}`}
                            className="rounded-xl border border-brand/15 bg-surface p-3"
                          >
                            <p className="truncate text-xs font-semibold text-brand">
                              {image.src}
                            </p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                              <input
                                value={image.alt}
                                onChange={(event) => {
                                  const nextAlt = event.target.value;
                                  setForm((current) => ({
                                    ...current,
                                    images: current.images.map(
                                      (candidate, candidateIndex) =>
                                        candidateIndex === imageIndex
                                          ? { ...candidate, alt: nextAlt }
                                          : candidate,
                                    ),
                                  }));
                                }}
                                className="themed-input h-9 w-full rounded-lg px-2.5 text-xs focus:outline-none"
                                placeholder="Image alt text"
                                disabled={!canWriteProducts}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((current) => ({
                                    ...current,
                                    images: current.images.filter(
                                      (_, candidateIndex) =>
                                        candidateIndex !== imageIndex,
                                    ),
                                  }));
                                }}
                                disabled={!canWriteProducts}
                                className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold btn-danger disabled:opacity-60"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-xl border border-brand/15 bg-surface p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                          Add Existing Image Path
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            value={manualImageSrc}
                            onChange={(event) =>
                              setManualImageSrc(event.target.value)
                            }
                            className="themed-input h-9 rounded-lg px-2.5 text-xs focus:outline-none"
                            placeholder="/products/photo-01.jpg"
                            disabled={!canWriteProducts}
                          />
                          <input
                            value={manualImageAlt}
                            onChange={(event) =>
                              setManualImageAlt(event.target.value)
                            }
                            className="themed-input h-9 rounded-lg px-2.5 text-xs focus:outline-none"
                            placeholder="Alt text"
                            disabled={!canWriteProducts}
                          />
                          <button
                            type="button"
                            onClick={handleAddManualImage}
                            disabled={!canWriteProducts}
                            className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-60"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isSaving || !canWriteProducts}
                        onClick={handleSaveProduct}
                        className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-70"
                      >
                        {isSaving ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save Product
                      </button>
                      {selectedProductId ? (
                        <button
                          type="button"
                          disabled={isSaving || !canWriteProducts}
                          onClick={handleDeleteProduct}
                          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-danger disabled:opacity-70"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={resetProductForm}
                        className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
                      >
                        Reset Form
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
            {activePanel === "media" ? (
              <div className="space-y-4">
                <AdminHeroPanel
                  csrfToken={csrfToken}
                  canWrite={canWriteMedia}
                />
                <article className="glass-card rounded-3xl p-5 sm:p-6">
                  <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                    <ShieldCheck className="h-5 w-5 text-accent" /> Image
                    Standards Command
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Enforced exact dimensions keep storefront media clean and
                    professional.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Object.values(IMAGE_PRESETS).map((preset) => (
                      <div
                        key={preset.key}
                        className="surface-card rounded-2xl p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.12em] text-muted">
                          {preset.label}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-brand">
                          {preset.exactWidth}x{preset.exactHeight}px
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Max file size
                          {(preset.maxFileSizeBytes / (1024 * 1024)).toFixed(1)}
                          MB
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="glass-card rounded-3xl p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                      <AlertTriangle className="h-5 w-5 text-accent" />
                      Compliance Audit
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        void loadAudit();
                      }}
                      className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
                    >
                      <RefreshCcw className="h-4 w-4" /> Run Audit
                    </button>
                  </div>
                  {audit ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm text-muted">
                        Compliance rate:
                        <span className="font-semibold text-brand">
                          {audit.summary.complianceRate.toFixed(2)}%
                        </span>
                      </p>
                      {audit.issues.length > 0 ? (
                        <div className="admin-table-wrap admin-table-mobile rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-2">
                          <table className="admin-table admin-table-pin-first text-xs">
                            <thead>
                              <tr>
                                <th>Image</th>
                                <th>Issue</th>
                                <th className="text-right">Detected Size</th>
                              </tr>
                            </thead>
                            <tbody>
                              {audit.issues.map((issue) => (
                                <tr key={`${issue.src}-${issue.reason}`}>
                                  <td className="font-mono text-[11px]">
                                    {issue.src}
                                  </td>
                                  <td className="text-[var(--status-warning-text)]">
                                    {issue.reason}
                                  </td>
                                  <td className="text-right">
                                    {issue.width && issue.height
                                      ? `${issue.width}x${issue.height}`
                                      : "N/A"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="inline-flex items-center gap-2 text-sm text-[var(--status-success-text)]">
                          <CheckCircle2 className="h-4 w-4" /> All product
                          images comply with required dimensions.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      Audit data is loading...
                    </p>
                  )}
                </article>
              </div>
            ) : null}
            {activePanel === "promotions" ? (
              <div className="space-y-3">
                {!csrfToken ? (
                  <p className="status-info rounded-xl px-3 py-2 text-sm">
                    Security token is initializing. Promotion updates are
                    temporarily read-only.
                  </p>
                ) : null}
                <AdminPromotionsPanel
                  revenueBaselineCents={summary?.orders.totalRevenueCents ?? 0}
                  csrfToken={csrfToken}
                  canWrite={canWritePromotions && Boolean(csrfToken)}
                />
              </div>
            ) : null}
            {activePanel === "support" ? (
              <div className="space-y-3">
                {canReadSupport ? (
                  <AdminSupportPanel canWriteByRole={canWriteSupport} />
                ) : (
                  <p className="status-info rounded-xl px-3 py-2 text-sm">
                    Your role can view dashboard analytics but cannot access
                    support operations.
                  </p>
                )}
              </div>
            ) : null}
            {activePanel === "reports" ? (
              <div className="space-y-4">
                {!csrfToken ? (
                  <p className="status-info rounded-xl px-3 py-2 text-sm">
                    Security token is initializing. Report mutations are
                    temporarily read-only.
                  </p>
                ) : null}
                <AdminOrdersPanel
                  csrfToken={csrfToken}
                  canWrite={canWriteOrders && Boolean(csrfToken)}
                  onAfterMutation={loadSummary}
                />
                <AdminReviewsPanel
                  csrfToken={csrfToken}
                  canWrite={canWriteProducts && Boolean(csrfToken)}
                  onAfterMutation={async () => {
                    await Promise.all([loadSummary(), loadProducts()]);
                  }}
                />
                <article className="glass-card rounded-3xl p-5 sm:p-6">
                  <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                    <FileCheck2 className="h-5 w-5 text-accent" /> Reports
                    Snapshot
                  </h3>
                  <p className="mt-3 text-sm text-muted">
                    Orders:
                    <span className="font-semibold text-brand">
                      {summary?.orders.totalOrders ?? 0}
                    </span>
                    - Completed:
                    <span className="font-semibold text-brand">
                      {summary?.orders.completedOrders ?? 0}
                    </span>
                    - Failed:
                    <span className="font-semibold text-brand">
                      {summary?.orders.failedOrders ?? 0}
                    </span>
                    .
                  </p>
                  <div className="mt-5 overflow-x-auto pb-1">
                    <div
                      className="grid min-w-[26rem] items-end gap-1.5 pr-1 sm:min-w-0"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(dailyOrderSeries.length, 1)}, minmax(0, 1fr))`,
                      }}
                    >
                      {dailyOrderSeries.map((point) => {
                        const barHeight = Math.max(
                          12,
                          Math.round(
                            (point.orderCount / highestDailyOrders) * 92,
                          ),
                        );
                        return (
                          <div
                            key={`daily-orders-${point.key}`}
                            className="text-center"
                          >
                            <div className="mx-auto flex h-24 w-full max-w-5 items-end rounded-md bg-surface-soft p-0.5">
                              <div
                                className="w-full rounded-sm bg-[linear-gradient(180deg,var(--brand-action)_0%,var(--accent)_100%)]"
                                style={{ height: `${barHeight}px` }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] font-semibold text-muted">
                              {point.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="admin-table-wrap admin-table-mobile mt-4">
                    <table className="admin-table admin-table-pin-first text-xs sm:text-sm">
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th className="text-right">Orders</th>
                          <th className="text-right">Revenue</th>
                          <th className="hidden text-right sm:table-cell">
                            Completed
                          </th>
                          <th className="hidden text-right sm:table-cell">
                            Active
                          </th>
                          <th className="hidden text-right sm:table-cell">
                            Failed
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyOrderSeries.map((point) => (
                          <tr key={`daily-table-${point.key}`}>
                            <td>{point.label}</td>
                            <td className="text-right">{point.orderCount}</td>
                            <td className="text-right">
                              {formatPrice(point.revenueCents)}
                            </td>
                            <td className="hidden text-right sm:table-cell">
                              {point.completedCount}
                            </td>
                            <td className="hidden text-right sm:table-cell">
                              {point.activeCount}
                            </td>
                            <td className="hidden text-right sm:table-cell">
                              {point.failedCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            ) : null}
            {activePanel === "settings" ? (
              <div className="space-y-4">
                <article className="glass-card rounded-3xl p-5 sm:p-6">
                  <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                    <SunMedium className="h-5 w-5 text-accent" /> Theme
                    Appearance
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Choose how the admin workspace looks while preserving
                    storefront theme consistency.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      disabled={!themeControlReady}
                      aria-pressed={
                        themeControlReady ? theme === "light" : undefined
                      }
                      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${themeControlReady && theme === "light" ? "btn-primary" : "btn-secondary"}`}
                      title="Switch to light theme"
                    >
                      <SunMedium className="h-4 w-4" /> Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      disabled={!themeControlReady}
                      aria-pressed={
                        themeControlReady ? theme === "dark" : undefined
                      }
                      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-60 ${themeControlReady && theme === "dark" ? "btn-primary" : "btn-secondary"}`}
                      title="Switch to dark theme"
                    >
                      <MoonStar className="h-4 w-4" /> Dark
                    </button>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      disabled={!themeControlReady}
                      className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary disabled:opacity-60"
                      title="Toggle between light and dark theme"
                    >
                      <RefreshCcw className="h-4 w-4" /> Toggle
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {themeControlReady
                      ? `Current theme: ${theme}.`
                      : "Theme settings are initializing..."}
                  </p>
                </article>
                {csrfToken ? (
                  <>
                    <AdminShippingSettingsPanel
                      csrfToken={csrfToken}
                      canWrite={canWriteSecurity}
                    />
                    <AdminTaxonomyPanel
                      csrfToken={csrfToken}
                      canWrite={canWriteProducts}
                      onAfterMutation={loadProducts}
                    />
                    <AdminSecurityOpsPanel
                      csrfToken={csrfToken}
                      canWrite={canWriteSecurity}
                    />
                  </>
                ) : (
                  <article className="glass-card rounded-3xl p-5 sm:p-6">
                    <p className="inline-flex items-center gap-2 text-sm text-muted">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Initializing admin security...
                    </p>
                  </article>
                )}
                <article className="glass-card rounded-3xl p-5 sm:p-6">
                  <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                    <Settings className="h-5 w-5 text-accent" /> Platform
                    Configuration Notes
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    <li>
                      Role overrides are persisted in MongoDB and supersede
                      environment role assignments per email.
                    </li>
                    <li>
                      Admin mutation rate limiting uses shared MongoDB buckets
                      for distributed deployments.
                    </li>
                    <li>
                      Catalog taxonomy CRUD uses
                      <code>MONGODB_TAXONOMY_COLLECTION</code>.
                    </li>
                    <li>
                      Shipping pricing settings persist in
                      <code>MONGODB_SETTINGS_COLLECTION</code> and override env
                      defaults.
                    </li>
                    <li>
                      Set <code>S3_BUCKET</code>, <code>S3_ACCESS_KEY_ID</code>,
                      and <code>S3_SECRET_ACCESS_KEY</code> to store admin
                      uploads in object storage.
                    </li>
                  </ul>
                </article>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
