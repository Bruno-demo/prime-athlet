import "server-only";

import { Collection, ObjectId } from "mongodb";

import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

export type SupportContentType = "customer_service" | "policy";

export interface SupportContentItem {
  id: string;
  title: string;
  icon: string;
  content: string;
  sortOrder: number;
}

interface SupportContentDocument {
  _id: ObjectId;
  type: SupportContentType;
  id: string;
  title: string;
  icon: string;
  content: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const supportContentTypes = new Set<SupportContentType>([
  "customer_service",
  "policy",
]);

const defaultCustomerServiceItems: SupportContentItem[] = [
  {
    id: "help-center",
    title: "Help Center",
    icon: "circle-help",
    content:
      "Browse account, checkout, payment, and shipping help topics. If you still need assistance, use the report form and include your order number for faster support.",
    sortOrder: 1,
  },
  {
    id: "returns-refunds",
    title: "Returns & Refunds",
    icon: "shield-check",
    content:
      "Most products are eligible for return within 30 days in original condition. Refunds are issued after warehouse inspection to your original payment method.",
    sortOrder: 2,
  },
  {
    id: "order-tracking",
    title: "Order Tracking",
    icon: "package-search",
    content:
      "Track real-time progress for all orders from processing to delivery. Signed-in users can access full order timelines from the account dashboard.",
    sortOrder: 3,
  },
  {
    id: "shipping-delivery",
    title: "Shipping & Delivery",
    icon: "truck",
    content:
      "Shipping timelines vary by destination and inventory location. Expedited options appear at checkout when available for your selected address.",
    sortOrder: 4,
  },
  {
    id: "report-concern-guide",
    title: "Report a Concern",
    icon: "circle-help",
    content:
      "Report issues related to order fulfillment, damaged goods, payment, or policy concerns. Include screenshots and order references to speed up resolution.",
    sortOrder: 5,
  },
];

const defaultPolicyItems: SupportContentItem[] = [
  {
    id: "terms-of-use",
    title: "Terms of Use",
    icon: "scroll-text",
    content:
      "By using this platform you agree to the store terms, service boundaries, and lawful use of the website and ordering system.",
    sortOrder: 1,
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    icon: "lock",
    content:
      "We process customer data to fulfill orders, manage accounts, and secure transactions. Data handling follows the policy disclosed on this page.",
    sortOrder: 2,
  },
  {
    id: "cookie-preferences",
    title: "Cookie Preferences",
    icon: "file-text",
    content:
      "Cookies are used for session state, analytics, and storefront personalization. You can control browser-level cookie settings at any time.",
    sortOrder: 3,
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    icon: "shield-check",
    content:
      "All logos, product content, and storefront assets are protected. Unauthorized redistribution or reuse of protected assets is prohibited.",
    sortOrder: 4,
  },
  {
    id: "accessibility",
    title: "Accessibility",
    icon: "circle-help",
    content:
      "We continuously improve keyboard navigation, readability, and responsive behavior. Accessibility issues can be reported through support channels.",
    sortOrder: 5,
  },
];

let supportContentIndexesReady = false;

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
}

function isSupportContentType(value: unknown): value is SupportContentType {
  return (
    typeof value === "string" &&
    supportContentTypes.has(value as SupportContentType)
  );
}

function normalizeSortOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.floor(value), 0), 10_000);
}

function toSupportContentItem(
  doc: Partial<SupportContentDocument> | null | undefined,
): SupportContentItem | null {
  if (!doc) {
    return null;
  }
  const id = normalizeText(doc.id);
  const title = normalizeText(doc.title);
  const icon = normalizeText(doc.icon);
  const content = normalizeText(doc.content);
  if (!id || !title || !icon || !content) {
    return null;
  }
  return {
    id,
    title,
    icon,
    content,
    sortOrder: normalizeSortOrder(doc.sortOrder),
  };
}

async function getSupportContentCollection(): Promise<Collection<SupportContentDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<SupportContentDocument>(
    process.env.MONGODB_SUPPORT_CONTENT_COLLECTION || "support_content",
  );
  if (!supportContentIndexesReady) {
    await collection.createIndex({ type: 1, id: 1 }, { unique: true });
    await collection.createIndex({ type: 1, sortOrder: 1, title: 1 });
    supportContentIndexesReady = true;
  }
  return collection;
}

async function ensureSupportContentSeeded(
  collection: Collection<SupportContentDocument>,
): Promise<void> {
  const [customerCount, policyCount] = await Promise.all([
    collection.countDocuments({ type: "customer_service" }),
    collection.countDocuments({ type: "policy" }),
  ]);
  if (customerCount > 0 && policyCount > 0) {
    return;
  }

  const now = new Date();
  const upserts: Promise<unknown>[] = [];

  if (customerCount === 0) {
    for (const item of defaultCustomerServiceItems) {
      upserts.push(
        collection.updateOne(
          { type: "customer_service", id: item.id },
          {
            $set: {
              type: "customer_service",
              id: item.id,
              title: item.title,
              icon: item.icon,
              content: item.content,
              sortOrder: item.sortOrder,
              updatedAt: now,
            },
            $setOnInsert: {
              _id: new ObjectId(),
              createdAt: now,
            },
          },
          { upsert: true },
        ),
      );
    }
  }

  if (policyCount === 0) {
    for (const item of defaultPolicyItems) {
      upserts.push(
        collection.updateOne(
          { type: "policy", id: item.id },
          {
            $set: {
              type: "policy",
              id: item.id,
              title: item.title,
              icon: item.icon,
              content: item.content,
              sortOrder: item.sortOrder,
              updatedAt: now,
            },
            $setOnInsert: {
              _id: new ObjectId(),
              createdAt: now,
            },
          },
          { upsert: true },
        ),
      );
    }
  }

  if (upserts.length > 0) {
    await Promise.all(upserts);
  }
}

function sortContentItems(items: SupportContentItem[]): SupportContentItem[] {
  return [...items].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.title.localeCompare(right.title);
  });
}

export async function getSupportCenterContent(): Promise<{
  customerServiceItems: SupportContentItem[];
  policyItems: SupportContentItem[];
}> {
  try {
    const collection = await getSupportContentCollection();
    if (!collection) {
      return {
        customerServiceItems: defaultCustomerServiceItems,
        policyItems: defaultPolicyItems,
      };
    }

    await ensureSupportContentSeeded(collection);
    const docs = await collection
      .find({ type: { $in: ["customer_service", "policy"] } })
      .toArray();

    const customerServiceItems = sortContentItems(
      docs
        .filter((doc) => isSupportContentType(doc.type) && doc.type === "customer_service")
        .map((doc) => toSupportContentItem(doc))
        .filter((item): item is SupportContentItem => item !== null),
    );

    const policyItems = sortContentItems(
      docs
        .filter((doc) => isSupportContentType(doc.type) && doc.type === "policy")
        .map((doc) => toSupportContentItem(doc))
        .filter((item): item is SupportContentItem => item !== null),
    );

    return {
      customerServiceItems:
        customerServiceItems.length > 0
          ? customerServiceItems
          : defaultCustomerServiceItems,
      policyItems: policyItems.length > 0 ? policyItems : defaultPolicyItems,
    };
  } catch {
    return {
      customerServiceItems: defaultCustomerServiceItems,
      policyItems: defaultPolicyItems,
    };
  }
}

