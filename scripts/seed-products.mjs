import { randomBytes, scryptSync } from "node:crypto";

import { MongoClient, ObjectId } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || "PrimeAthlete!123";

if (!mongoUri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB environment variables.");
  process.exit(1);
}

const collectionNames = {
  products: process.env.MONGODB_PRODUCTS_COLLECTION || "products",
  orders: process.env.MONGODB_ORDERS_COLLECTION || "orders",
  users: process.env.MONGODB_USERS_COLLECTION || "users",
  sessions: process.env.MONGODB_SESSIONS_COLLECTION || "sessions",
  authTokens: process.env.MONGODB_AUTH_TOKENS_COLLECTION || "auth_tokens",
  reviews: process.env.MONGODB_REVIEWS_COLLECTION || "reviews",
  taxonomy: process.env.MONGODB_TAXONOMY_COLLECTION || "taxonomy",
  promotions: process.env.MONGODB_PROMOTIONS_COLLECTION || "promotions",
  wishlists: process.env.MONGODB_WISHLISTS_COLLECTION || "wishlists",
  compare: process.env.MONGODB_COMPARE_COLLECTION || "compare_lists",
  heroSlides: process.env.MONGODB_HERO_SLIDES_COLLECTION || "hero_slides",
  supportTickets:
    process.env.MONGODB_SUPPORT_TICKETS_COLLECTION || "support_tickets",
  supportContent:
    process.env.MONGODB_SUPPORT_CONTENT_COLLECTION || "support_content",
  adminAssignments:
    process.env.MONGODB_ADMIN_ASSIGNMENTS_COLLECTION || "admin_assignments",
  adminAudit: process.env.MONGODB_ADMIN_AUDIT_COLLECTION || "admin_audit_logs",
  adminRateLimits:
    process.env.MONGODB_ADMIN_RATE_LIMITS_COLLECTION || "admin_rate_limits",
  settings: process.env.MONGODB_SETTINGS_COLLECTION || "settings",
};

const targetCollections = Array.from(new Set(Object.values(collectionNames)));

const argv = new Set(process.argv.slice(2));
const wipeOnly = argv.has("--wipe-only");
const SHIPPING_FLAT_RATE_CENTS = Number.parseInt(
  process.env.SHIPPING_FLAT_RATE_CENTS || "900",
  10,
);
const FREE_SHIPPING_THRESHOLD_CENTS = Number.parseInt(
  process.env.FREE_SHIPPING_THRESHOLD_CENTS || "12000",
  10,
);

function calculateShippingCents(subtotalCents) {
  const safeSubtotal = Math.max(Math.floor(subtotalCents), 0);
  const safeFlatRate = Number.isFinite(SHIPPING_FLAT_RATE_CENTS)
    ? Math.max(Math.floor(SHIPPING_FLAT_RATE_CENTS), 0)
    : 900;
  const safeThreshold = Number.isFinite(FREE_SHIPPING_THRESHOLD_CENTS)
    ? Math.max(Math.floor(FREE_SHIPPING_THRESHOLD_CENTS), 0)
    : 12000;
  if (safeSubtotal <= 0) {
    return 0;
  }
  if (safeThreshold > 0 && safeSubtotal >= safeThreshold) {
    return 0;
  }
  return safeFlatRate;
}

const SPORT_CONFIGS = [
  {
    sport: "Football",
    tone: "field",
    categoryPool: ["Footwear", "Apparel", "Accessories", "Bags"],
    descriptors: ["Velocity", "Blitz", "Titan", "Grid", "Matchday", "Aero"],
  },
  {
    sport: "Basketball",
    tone: "court",
    categoryPool: ["Footwear", "Apparel", "Accessories", "Bags"],
    descriptors: ["Court", "Rebound", "Arc", "Skyline", "Clutch", "Drive"],
  },
  {
    sport: "Running",
    tone: "street",
    categoryPool: ["Footwear", "Apparel", "Accessories"],
    descriptors: ["Pulse", "Stride", "Pace", "Distance", "Aero", "Tempo"],
  },
  {
    sport: "Training",
    tone: "fitness",
    categoryPool: ["Accessories", "Apparel", "Bags"],
    descriptors: ["Core", "Power", "Lift", "Torque", "Forge", "Active"],
  },
  {
    sport: "Outdoor",
    tone: "outdoor",
    categoryPool: ["Footwear", "Apparel", "Accessories", "Bags"],
    descriptors: ["Trail", "Summit", "Alpine", "Ridge", "Expedition", "Terra"],
  },
];

const CATEGORY_TERMS = {
  Footwear: ["Runner", "Cleat", "Sprint", "Zoom", "Pro", "Edge"],
  Apparel: ["Jersey", "Top", "Shell", "Crew", "Pro", "Elite"],
  Accessories: ["Gloves", "Bottle", "Ball", "Kit", "Band", "Grip"],
  Bags: ["Pack", "Duffel", "Bag", "Carry", "Gear", "Transit"],
};

const CATEGORY_PRICE_RANGES = {
  Footwear: [8900, 19900],
  Apparel: [4500, 13900],
  Accessories: [2200, 9900],
  Bags: [5900, 16900],
};

const BADGE_POOL = [
  "Best Seller",
  "Top Rated",
  "New Arrival",
  "Limited Drop",
  "Coach Pick",
  "Pro Choice",
];

const REVIEW_TITLE_POOL = [
  "Great quality for training",
  "Excellent value and fit",
  "Strong build quality",
  "Very comfortable in session",
  "Reliable and durable",
  "Perfect for weekly use",
];

const REVIEW_COMMENT_POOL = [
  "Material quality is excellent and sizing is consistent with the product description.",
  "Fast delivery and reliable finish. Works well for repeated weekly sessions.",
  "Very happy with the durability and comfort. Worth the price.",
  "Good support and stable performance during longer training blocks.",
  "Solid product overall. Easy to recommend for team and personal use.",
  "Lightweight and practical. Exactly what I needed for this sport.",
];

const SUPPORT_SUBJECT_POOL = [
  "Need update on shipment status",
  "Requesting return instructions",
  "Payment confirmation question",
  "Issue with size selection",
  "Order item mismatch",
  "Account access problem",
];

const SUPPORT_MESSAGE_POOL = [
  "Please provide an update and expected next step for this request.",
  "I need support to resolve this quickly before upcoming training.",
  "Can you confirm current status and next action for my order?",
  "I already checked my account but still need manual support.",
  "Kindly advise what information you need from me to complete this.",
];

const SUPPORT_CONTENT_ITEMS = {
  customer_service: [
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
  ],
  policy: [
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
  ],
};

const FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Taylor",
  "Casey",
  "Morgan",
  "Riley",
  "Avery",
  "Skyler",
  "Harper",
  "Quinn",
  "Parker",
  "Cameron",
  "Logan",
  "Reese",
  "Drew",
  "Jamie",
];

const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Miller",
  "Davis",
  "Wilson",
  "Moore",
  "Taylor",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
  "Martin",
];

const seedValue = Number(process.env.SEED_VALUE || 20260220);
let rngState =
  Number.isFinite(seedValue) && seedValue > 0 ? seedValue >>> 0 : 20260220;

function random() {
  rngState = (1664525 * rngState + 1013904223) >>> 0;
  return rngState / 0x100000000;
}

function randInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function chance(probability) {
  return random() < probability;
}

function pick(items) {
  return items[randInt(0, items.length - 1)];
}

function pickN(items, count) {
  const source = [...items];
  const result = [];
  while (source.length > 0 && result.length < count) {
    const index = randInt(0, source.length - 1);
    const [item] = source.splice(index, 1);
    result.push(item);
  }
  return result;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toSku(productId) {
  return `PA-${productId}`
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .slice(0, 48);
}

function toPriceCents(category) {
  const [min, max] = CATEGORY_PRICE_RANGES[category] || [3500, 13900];
  return randInt(min, max);
}

function toPhotoPath(index) {
  return `/products/photo-${String(index).padStart(2, "0")}.jpg`;
}

function nowMinusDays(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function nowPlusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function randomDateInPast(maxDaysAgo) {
  return nowMinusDays(randInt(0, maxDaysAgo));
}

function randomDateBetween(start, end) {
  const startTs = start.getTime();
  const endTs = end.getTime();
  if (endTs <= startTs) {
    return new Date(startTs);
  }
  const delta = endTs - startTs;
  return new Date(startTs + Math.floor(random() * delta));
}

function normalizeEmailList(value) {
  if (!value || typeof value !== "string") {
    return [];
  }
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function displayNameFromEmail(email) {
  const local = email.split("@")[0] || "user";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) {
    return "Prime Athlete User";
  }
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

function buildBillingProfile(displayName, email, index) {
  if (!chance(0.55)) {
    return null;
  }
  return {
    fullName: displayName,
    company: chance(0.4) ? `Prime Team ${index + 1}` : "",
    phone: `+1-555-${String(randInt(100, 999))}-${String(randInt(1000, 9999))}`,
    line1: `${randInt(100, 9800)} Training Ave`,
    line2: chance(0.3) ? `Suite ${randInt(1, 99)}` : "",
    city: pick(["Austin", "Seattle", "Miami", "Denver", "Boston", "Atlanta"]),
    state: pick(["TX", "WA", "FL", "CO", "MA", "GA"]),
    postalCode: String(randInt(10000, 99999)),
    country: "US",
    taxId: chance(0.25) ? `TX-${randInt(100000, 999999)}` : "",
    emailHint: email,
  };
}

function buildProducts(count) {
  const products = [];
  const usedIds = new Set();

  for (let index = 0; index < count; index += 1) {
    const sportConfig = SPORT_CONFIGS[index % SPORT_CONFIGS.length];
    const category = pick(sportConfig.categoryPool);
    const descriptor = pick(sportConfig.descriptors);
    const term = pick(CATEGORY_TERMS[category] || CATEGORY_TERMS.Accessories);
    const baseName = `${descriptor} ${term}`;

    let id = slugify(
      `${sportConfig.sport}-${category}-${baseName}-${index + 1}`,
    );
    if (!id) {
      id = `product-${index + 1}`;
    }
    while (usedIds.has(id)) {
      id = `${id}-${randInt(2, 99)}`;
    }
    usedIds.add(id);

    const name = `${baseName} ${index + 1}`;
    const priceCents = toPriceCents(category);
    const compareAtPriceCents = chance(0.45)
      ? priceCents + randInt(500, Math.floor(priceCents * 0.35))
      : null;

    const imageStart = (index * 3) % 54;
    const images = [0, 1, 2].map((offset) => {
      const src = toPhotoPath(((imageStart + offset) % 54) + 1);
      return {
        src,
        alt: `${name} image ${offset + 1}`,
      };
    });

    products.push({
      id,
      name,
      sport: sportConfig.sport,
      category,
      priceCents,
      brand: "Prime Athlete",
      sku: toSku(id),
      stockQuantity: randInt(8, 240),
      compareAtPriceCents,
      tags: [
        sportConfig.sport.toLowerCase(),
        category.toLowerCase(),
        slugify(descriptor),
      ],
      rating: 0,
      reviews: 0,
      badge: pick(BADGE_POOL),
      description: `Built for ${sportConfig.sport.toLowerCase()} athletes, this ${category.toLowerCase()} item balances durability, fit consistency, and training comfort.`,
      tone: sportConfig.tone,
      images,
      createdAt: randomDateInPast(240),
      updatedAt: randomDateInPast(15),
    });
  }

  return products;
}

function buildUsers() {
  const ownerEmails = normalizeEmailList(process.env.ADMIN_OWNER_EMAILS);
  const adminEmails = normalizeEmailList(process.env.ADMIN_EMAILS);
  const managerEmails = normalizeEmailList(process.env.ADMIN_MANAGER_EMAILS);
  const supportEmails = normalizeEmailList(process.env.ADMIN_SUPPORT_EMAILS);
  const analystEmails = normalizeEmailList(process.env.ADMIN_ANALYST_EMAILS);

  const requiredAdminEmails = new Set([
    ...ownerEmails,
    ...adminEmails,
    ...managerEmails,
    ...supportEmails,
    ...analystEmails,
  ]);
  if (requiredAdminEmails.size === 0) {
    requiredAdminEmails.add("owner@prime-athlete.test");
  }

  const userEmails = new Set(requiredAdminEmails);
  while (userEmails.size < 42) {
    const email = `athlete${userEmails.size}@prime-athlete.test`;
    userEmails.add(email);
  }

  const users = [];
  let index = 0;
  for (const email of userEmails) {
    const displayName = requiredAdminEmails.has(email)
      ? displayNameFromEmail(email)
      : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const createdAt = randomDateInPast(365);
    const updatedAt = randomDateBetween(createdAt, new Date());
    const verifiedAt = chance(0.9)
      ? randomDateBetween(createdAt, new Date())
      : null;
    const lastLoginAt = chance(0.8)
      ? randomDateBetween(createdAt, new Date())
      : null;
    const billing = buildBillingProfile(displayName, email, index);

    users.push({
      _id: new ObjectId(),
      email,
      displayName,
      passwordHash: hashPassword(defaultPassword),
      accountType: "client",
      billingProfile: billing
        ? {
            fullName: billing.fullName,
            company: billing.company,
            phone: billing.phone,
            line1: billing.line1,
            line2: billing.line2,
            city: billing.city,
            state: billing.state,
            postalCode: billing.postalCode,
            country: billing.country,
            taxId: billing.taxId,
          }
        : null,
      adminTwoFactor: null,
      emailVerifiedAt: verifiedAt,
      createdAt,
      updatedAt,
      lastLoginAt,
    });
    index += 1;
  }

  const byEmail = new Map(users.map((user) => [user.email, user]));

  const assignments = new Map();
  function setRole(emails, role) {
    for (const email of emails) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (!assignments.has(normalized)) {
        assignments.set(normalized, role);
      }
    }
  }

  setRole(ownerEmails, "owner");
  setRole(adminEmails, "owner");
  setRole(managerEmails, "manager");
  setRole(supportEmails, "support");
  setRole(analystEmails, "analyst");

  if (!Array.from(assignments.values()).includes("owner")) {
    const firstUserEmail = users[0]?.email;
    if (firstUserEmail) {
      assignments.set(firstUserEmail, "owner");
    }
  }

  const adminAssignments = Array.from(assignments.entries())
    .filter(([email]) => byEmail.has(email))
    .map(([email, role]) => ({
      _id: new ObjectId(),
      email,
      role,
      disabled: false,
      createdAt: randomDateInPast(120),
      updatedAt: randomDateInPast(5),
      createdByEmail: email,
      updatedByEmail: email,
    }));

  return { users, adminAssignments };
}

function buildReviews(products, users) {
  const reviews = [];
  const userRefs = users.map((user) => ({
    id: user._id.toHexString(),
    email: user.email,
    displayName: user.displayName,
  }));

  for (const product of products) {
    const reviewCount = Math.min(randInt(2, 5), userRefs.length);
    const reviewers = pickN(userRefs, reviewCount);
    for (let index = 0; index < reviewers.length; index += 1) {
      const reviewer = reviewers[index];
      const status = index === 0 || chance(0.82) ? "approved" : "hidden";
      const rating = status === "approved" ? randInt(3, 5) : randInt(1, 5);
      const createdAt = randomDateInPast(180);

      reviews.push({
        _id: new ObjectId(),
        userId: reviewer.id,
        userEmail: reviewer.email,
        userDisplayName: reviewer.displayName,
        productId: product.id,
        productName: product.name,
        sport: product.sport,
        rating,
        title: pick(REVIEW_TITLE_POOL),
        comment: pick(REVIEW_COMMENT_POOL),
        status,
        createdAt,
        updatedAt: randomDateBetween(createdAt, new Date()),
      });
    }
  }

  const aggregate = new Map();
  for (const review of reviews) {
    if (review.status !== "approved") {
      continue;
    }
    const current = aggregate.get(review.productId) || { count: 0, total: 0 };
    current.count += 1;
    current.total += review.rating;
    aggregate.set(review.productId, current);
  }

  for (const product of products) {
    const stats = aggregate.get(product.id);
    if (!stats || stats.count === 0) {
      product.rating = 0;
      product.reviews = 0;
      continue;
    }
    product.rating = Number((stats.total / stats.count).toFixed(2));
    product.reviews = stats.count;
  }

  return reviews;
}

function buildPromotions(products) {
  const sports = Array.from(
    new Set(products.map((product) => product.sport.toLowerCase())),
  );
  const categories = Array.from(
    new Set(products.map((product) => product.category.toLowerCase())),
  );

  const promotions = [];
  const promotionCount = 14;

  for (let index = 0; index < promotionCount; index += 1) {
    const cycle = index % 4;
    const triggerType = chance(0.55) ? "code" : "automatic";
    const stackMode = chance(0.35) ? "exclusive" : "stackable";
    const discountType = chance(0.7) ? "percent" : "fixed";
    const discountValue =
      discountType === "percent" ? randInt(5, 25) : randInt(500, 3500);

    let startsAt = null;
    let endsAt = null;
    let isActive = true;

    if (cycle === 0) {
      startsAt = nowMinusDays(randInt(4, 20));
      endsAt = nowPlusDays(randInt(10, 45));
      isActive = true;
    } else if (cycle === 1) {
      startsAt = nowPlusDays(randInt(2, 18));
      endsAt = nowPlusDays(randInt(24, 90));
      isActive = true;
    } else if (cycle === 2) {
      startsAt = nowMinusDays(randInt(45, 120));
      endsAt = nowMinusDays(randInt(1, 30));
      isActive = true;
    } else {
      startsAt = nowMinusDays(randInt(10, 60));
      endsAt = chance(0.5) ? nowPlusDays(randInt(12, 80)) : null;
      isActive = false;
    }

    const scopeMode = index % 4;
    const scope = {
      sports: scopeMode === 0 ? pickN(sports, randInt(1, 2)) : [],
      categories: scopeMode === 1 ? pickN(categories, randInt(1, 2)) : [],
      productIds:
        scopeMode === 2
          ? pickN(
              products.map((product) => product.id),
              randInt(1, 3),
            )
          : [],
    };

    const usageLimit = chance(0.4) ? randInt(20, 140) : null;
    const usageCount =
      usageLimit === null
        ? randInt(0, 120)
        : randInt(0, Math.max(usageLimit - 1, 0));

    const code = `PRIME${String(index + 1).padStart(2, "0")}`;
    const createdAt = randomDateInPast(220);
    const updatedAt = randomDateBetween(createdAt, new Date());

    promotions.push({
      id: `promo-seed-${String(index + 1).padStart(2, "0")}`,
      code,
      name: `Prime Athlete Offer ${index + 1}`,
      description: `Seeded promotion ${index + 1} for pricing and conversion tests.`,
      triggerType,
      stackMode,
      priority: randInt(10, 180),
      scope,
      discountType,
      discountValue,
      minSubtotalCents: randInt(0, 16000),
      maxDiscountCents:
        discountType === "percent" && chance(0.7) ? randInt(1200, 12000) : null,
      startsAt,
      endsAt,
      isActive,
      usageLimit,
      usageCount,
      createdAt,
      updatedAt,
    });
  }

  return promotions;
}

function calculatePromotionDiscount(subtotalCents, promotion) {
  if (!promotion) {
    return 0;
  }
  if (promotion.minSubtotalCents > subtotalCents) {
    return 0;
  }
  if (!promotion.isActive) {
    return 0;
  }
  if (promotion.startsAt && promotion.startsAt.getTime() > Date.now()) {
    return 0;
  }
  if (promotion.endsAt && promotion.endsAt.getTime() < Date.now()) {
    return 0;
  }
  let discount = 0;
  if (promotion.discountType === "percent") {
    discount = Math.floor((subtotalCents * promotion.discountValue) / 100);
  } else {
    discount = promotion.discountValue;
  }
  if (promotion.maxDiscountCents !== null) {
    discount = Math.min(discount, promotion.maxDiscountCents);
  }
  return Math.max(discount, 0);
}

function toPromotionSnapshot(promotion, discountCents) {
  return {
    id: promotion.id,
    code: promotion.code,
    name: promotion.name,
    triggerType: promotion.triggerType,
    stackMode: promotion.stackMode,
    priority: promotion.priority,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    discountCents,
  };
}

function buildOrders(products, users, promotions) {
  const orders = [];
  const orderCount = 120;

  for (let index = 0; index < orderCount; index += 1) {
    const customer = pick(users);
    const lineItems = pickN(products, randInt(1, 3)).map((product) => ({
      id: product.id,
      name: product.name,
      quantity: randInt(1, 3),
      unitAmountCents: product.priceCents,
    }));

    const subtotalCents = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitAmountCents,
      0,
    );

    const promotion = chance(0.45) ? pick(promotions) : null;
    const discountCents = calculatePromotionDiscount(subtotalCents, promotion);
    const shippingCents = calculateShippingCents(subtotalCents);
    const promotionsSnapshot =
      promotion && discountCents > 0
        ? [toPromotionSnapshot(promotion, discountCents)]
        : [];

    const providerRoll = random();
    let paymentProvider = "stripe";
    if (providerRoll >= 0.58 && providerRoll < 0.82) {
      paymentProvider = "paypal";
    } else if (providerRoll >= 0.82) {
      paymentProvider = "bank_transfer";
    }

    let status = "completed";
    let paymentStatus = "paid";
    if (paymentProvider === "bank_transfer") {
      if (chance(0.62)) {
        status = "created";
        paymentStatus = "awaiting_transfer";
      } else {
        status = "completed";
        paymentStatus = "paid";
      }
    } else {
      const statusRoll = random();
      if (statusRoll < 0.72) {
        status = "completed";
        paymentStatus = "paid";
      } else if (statusRoll < 0.86) {
        status = "created";
        paymentStatus = "pending";
      } else if (statusRoll < 0.95) {
        status = "payment_failed";
        paymentStatus = "failed";
      } else {
        status = "expired";
        paymentStatus = "expired";
      }
    }

    let fulfillmentStatus = "unfulfilled";
    if (status === "completed") {
      const fulfillmentRoll = random();
      if (fulfillmentRoll < 0.62) {
        fulfillmentStatus = "fulfilled";
      } else if (fulfillmentRoll < 0.9) {
        fulfillmentStatus = "unfulfilled";
      } else {
        fulfillmentStatus = "cancelled";
      }
    } else if (status === "payment_failed" || status === "expired") {
      fulfillmentStatus = "cancelled";
    }

    const createdAt = randomDateInPast(160);
    const updatedAt = randomDateBetween(createdAt, new Date());
    const expectedTotalCents = Math.max(subtotalCents - discountCents, 0) + shippingCents;
    const totalCents =
      status === "completed" ? expectedTotalCents : null;

    let refundedAt = null;
    let refundId = null;
    if (status === "completed" && chance(0.08)) {
      refundedAt = randomDateBetween(updatedAt, new Date());
      paymentStatus = "refunded";
      refundId = `rfnd_${String(index + 1).padStart(6, "0")}`;
      fulfillmentStatus =
        fulfillmentStatus === "fulfilled" ? "fulfilled" : "cancelled";
    }

    const fulfilledAt =
      fulfillmentStatus === "fulfilled"
        ? randomDateBetween(updatedAt, new Date())
        : null;
    const cancelledAt =
      fulfillmentStatus === "cancelled"
        ? randomDateBetween(updatedAt, new Date())
        : null;

    let stripeSessionId = `cs_seed_${String(index + 1).padStart(6, "0")}`;
    let externalPaymentId = `pi_seed_${String(index + 1).padStart(6, "0")}`;
    if (paymentProvider === "paypal") {
      stripeSessionId = `paypal_seed_${String(index + 1).padStart(6, "0")}`;
      externalPaymentId = `PAYPAL-${String(index + 1).padStart(10, "0")}`;
    } else if (paymentProvider === "bank_transfer") {
      stripeSessionId = `bank_seed_${String(index + 1).padStart(6, "0")}`;
      externalPaymentId = `BANK-${String(index + 1).padStart(10, "0")}`;
    }

    orders.push({
      stripeSessionId,
      status,
      paymentProvider,
      externalPaymentId,
      paymentStatus,
      customerEmail: customer.email,
      fulfillmentStatus,
      fulfilledAt,
      cancelledAt,
      refundedAt,
      refundId,
      items: lineItems,
      subtotalCents,
      discountCents,
      shippingCents,
      promotions: promotionsSnapshot,
      totalCents,
      currency: "usd",
      createdAt,
      updatedAt,
    });
  }

  return orders;
}

function buildHeroSlides(products) {
  const selected = products.slice(0, 8);
  return selected.map((product, index) => ({
    id: `hero-${String(index + 1).padStart(2, "0")}`,
    title:
      index % 2 === 0
        ? `${product.sport} Weekend Deals`
        : `Level Up Your ${product.sport} Season`,
    subtitle: `${product.name} and related gear now available with limited-time pricing and fast shipping.`,
    badge: product.badge,
    href: `/shop/${product.id}`,
    image: product.images[0],
    isActive: index < 6,
    sortOrder: index + 1,
    createdAt: randomDateInPast(120),
    updatedAt: randomDateInPast(4),
  }));
}

function buildShippingSettings() {
  const now = new Date();
  return [
    {
      key: "shipping",
      flatRateCents: Number.isFinite(SHIPPING_FLAT_RATE_CENTS)
        ? Math.max(Math.floor(SHIPPING_FLAT_RATE_CENTS), 0)
        : 900,
      freeShippingThresholdCents: Number.isFinite(
        FREE_SHIPPING_THRESHOLD_CENTS,
      )
        ? Math.max(Math.floor(FREE_SHIPPING_THRESHOLD_CENTS), 0)
        : 12000,
      createdAt: now,
      updatedAt: now,
      updatedBy: "seed",
    },
  ];
}

function buildTaxonomy(products) {
  const sports = Array.from(
    new Set(products.map((product) => product.sport)),
  ).sort();
  const categories = Array.from(
    new Set(products.map((product) => product.category)),
  ).sort();
  const now = new Date();

  const docs = [];
  for (const sport of sports) {
    docs.push({
      _id: new ObjectId(),
      type: "sport",
      slug: slugify(sport),
      value: sport,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const category of categories) {
    docs.push({
      _id: new ObjectId(),
      type: "category",
      slug: slugify(category),
      value: category,
      createdAt: now,
      updatedAt: now,
    });
  }
  return docs;
}

function buildSupportTickets(users, orders) {
  const statuses = [
    "open",
    "in_progress",
    "awaiting_customer",
    "resolved",
    "closed",
  ];
  const priorities = ["low", "normal", "high", "urgent"];
  const categories = [
    "order",
    "payment",
    "account",
    "technical",
    "return",
    "other",
  ];
  const tickets = [];

  for (let index = 0; index < 80; index += 1) {
    const user = pick(users);
    const status = pick(statuses);
    const createdAt = randomDateInPast(140);
    const updatedAt = randomDateBetween(createdAt, new Date());
    const resolvedAt =
      status === "resolved" || status === "closed"
        ? randomDateBetween(updatedAt, new Date())
        : null;
    const order = chance(0.65) ? pick(orders) : null;

    tickets.push({
      _id: new ObjectId(),
      code: `SUP-${String(index + 1).padStart(5, "0")}`,
      userId: user._id.toHexString(),
      customerEmail: user.email,
      customerName: user.displayName,
      subject: pick(SUPPORT_SUBJECT_POOL),
      message: pick(SUPPORT_MESSAGE_POOL),
      category: pick(categories),
      priority: pick(priorities),
      status,
      orderReference: order ? order.stripeSessionId : null,
      adminNote:
        status === "open"
          ? null
          : "Seeded support note for admin queue testing.",
      createdAt,
      updatedAt,
      resolvedAt,
    });
  }

  return tickets;
}

function buildSupportContent() {
  const now = new Date();
  const rows = [];

  for (const item of SUPPORT_CONTENT_ITEMS.customer_service) {
    rows.push({
      _id: new ObjectId(),
      type: "customer_service",
      id: item.id,
      title: item.title,
      icon: item.icon,
      content: item.content,
      sortOrder: item.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const item of SUPPORT_CONTENT_ITEMS.policy) {
    rows.push({
      _id: new ObjectId(),
      type: "policy",
      id: item.id,
      title: item.title,
      icon: item.icon,
      content: item.content,
      sortOrder: item.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  }

  return rows;
}

function buildWishlists(users, products) {
  return users.slice(0, 24).map((user) => ({
    userId: user._id.toHexString(),
    productIds: pickN(
      products.map((product) => product.id),
      randInt(3, 8),
    ),
    createdAt: randomDateInPast(120),
    updatedAt: randomDateInPast(2),
  }));
}

function buildCompareLists(users, products) {
  return users.slice(0, 18).map((user) => ({
    userId: user._id.toHexString(),
    productIds: pickN(
      products.map((product) => product.id),
      randInt(2, 4),
    ),
    createdAt: randomDateInPast(90),
    updatedAt: randomDateInPast(2),
  }));
}

function buildAdminAuditEvents(adminAssignments) {
  const actions = [
    ["products.upsert", "product"],
    ["products.delete", "product"],
    ["promotions.upsert", "promotion"],
    ["promotions.delete", "promotion"],
    ["orders.fulfill", "order"],
    ["orders.refund", "order"],
    ["reviews.moderate", "review"],
    ["support.update", "support_ticket"],
  ];
  const statuses = ["success", "success", "success", "failure", "denied"];
  const admins = adminAssignments.map((entry) => ({
    email: entry.email,
    role: entry.role || "owner",
  }));
  if (admins.length === 0) {
    return [];
  }

  const events = [];
  for (let index = 0; index < 90; index += 1) {
    const actor = pick(admins);
    const [action, resourceType] = pick(actions);
    events.push({
      _id: new ObjectId(),
      actorUserId: null,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      resourceType,
      resourceId: `${resourceType}-${randInt(1, 300)}`,
      status: pick(statuses),
      message: "Seeded admin audit event.",
      metadata: { source: "seed-script", index },
      ipAddress: `203.0.113.${randInt(10, 250)}`,
      userAgent: "seed-script/1.0",
      createdAt: randomDateInPast(60),
    });
  }
  return events;
}

async function clearCollections(db) {
  for (const collectionName of targetCollections) {
    const collection = db.collection(collectionName);
    await collection.deleteMany({});
    console.log(`Cleared ${dbName}.${collectionName}`);
  }
}

async function insertMany(db, collectionName, docs) {
  if (!Array.isArray(docs) || docs.length === 0) {
    return 0;
  }
  const collection = db.collection(collectionName);
  await collection.insertMany(docs, { ordered: false });
  return docs.length;
}

const client = new MongoClient(mongoUri);

try {
  await client.connect();
  const db = client.db(dbName);

  await clearCollections(db);

  if (wipeOnly) {
    console.log("Database wipe completed (wipe-only mode).");
    process.exit(0);
  }

  const products = buildProducts(60);
  const { users, adminAssignments } = buildUsers();
  const reviews = buildReviews(products, users);
  const promotions = buildPromotions(products);
  const orders = buildOrders(products, users, promotions);
  const heroSlides = buildHeroSlides(products);
  const taxonomy = buildTaxonomy(products);
  const supportTickets = buildSupportTickets(users, orders);
  const supportContent = buildSupportContent();
  const shippingSettings = buildShippingSettings();
  const wishlists = buildWishlists(users, products);
  const compareLists = buildCompareLists(users, products);
  const adminAudit = buildAdminAuditEvents(adminAssignments);

  const insertedCounts = {
    products: await insertMany(db, collectionNames.products, products),
    users: await insertMany(db, collectionNames.users, users),
    reviews: await insertMany(db, collectionNames.reviews, reviews),
    promotions: await insertMany(db, collectionNames.promotions, promotions),
    orders: await insertMany(db, collectionNames.orders, orders),
    heroSlides: await insertMany(db, collectionNames.heroSlides, heroSlides),
    taxonomy: await insertMany(db, collectionNames.taxonomy, taxonomy),
    supportTickets: await insertMany(
      db,
      collectionNames.supportTickets,
      supportTickets,
    ),
    supportContent: await insertMany(
      db,
      collectionNames.supportContent,
      supportContent,
    ),
    settings: await insertMany(db, collectionNames.settings, shippingSettings),
    wishlists: await insertMany(db, collectionNames.wishlists, wishlists),
    compare: await insertMany(db, collectionNames.compare, compareLists),
    adminAssignments: await insertMany(
      db,
      collectionNames.adminAssignments,
      adminAssignments,
    ),
    adminAudit: await insertMany(db, collectionNames.adminAudit, adminAudit),
  };

  console.log("");
  console.log("Seed completed with database-only records:");
  for (const [key, value] of Object.entries(insertedCounts)) {
    console.log(`- ${key}: ${value}`);
  }
  console.log(`Default seeded password: ${defaultPassword}`);
} catch (error) {
  console.error("Seeding failed.", error);
  process.exitCode = 1;
} finally {
  await client.close();
}
