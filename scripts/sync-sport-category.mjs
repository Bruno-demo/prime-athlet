import { MongoClient, ObjectId } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!mongoUri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB environment variables.");
  process.exit(1);
}

const productsCollectionName =
  process.env.MONGODB_PRODUCTS_COLLECTION || "products";
const taxonomyCollectionName =
  process.env.MONGODB_TAXONOMY_COLLECTION || "taxonomy";

const argv = new Set(process.argv.slice(2));
if (argv.has("--check") && argv.has("--fix")) {
  console.error('Use either "--check" or "--fix", not both.');
  process.exit(1);
}

const mode = argv.has("--fix") ? "fix" : "check";
const PREVIEW_LIMIT = 12;

function normalizeValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function createCanonicalByTypeMap(taxonomyDocs, type) {
  const map = new Map();
  for (const doc of taxonomyDocs) {
    if (doc.type !== type) {
      continue;
    }
    const normalized = normalizeValue(doc.value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (!map.has(key)) {
      map.set(key, normalized);
    }
  }
  return map;
}

function previewList(values) {
  const list = values.slice(0, PREVIEW_LIMIT);
  const suffix = values.length > PREVIEW_LIMIT ? " ..." : "";
  return list.length > 0 ? `${list.join(", ")}${suffix}` : "(none)";
}

function analyzeSync(products, taxonomyDocs) {
  const sportCanonical = createCanonicalByTypeMap(taxonomyDocs, "sport");
  const categoryCanonical = createCanonicalByTypeMap(taxonomyDocs, "category");

  const plannedProductUpdates = [];
  const invalidProducts = [];
  const missingSports = new Set();
  const missingCategories = new Set();
  const usedSports = new Set();
  const usedCategories = new Set();

  for (const product of products) {
    const next = {};
    const sportRaw = typeof product.sport === "string" ? product.sport : "";
    const categoryRaw =
      typeof product.category === "string" ? product.category : "";
    const sportNormalized = normalizeValue(sportRaw);
    const categoryNormalized = normalizeValue(categoryRaw);

    if (!sportNormalized || !categoryNormalized) {
      invalidProducts.push({
        id: product.id || product._id.toString(),
        name: product.name || "(unnamed)",
        sport: sportRaw,
        category: categoryRaw,
      });
      continue;
    }

    const canonicalSport =
      sportCanonical.get(sportNormalized.toLowerCase()) || sportNormalized;
    const canonicalCategory =
      categoryCanonical.get(categoryNormalized.toLowerCase()) ||
      categoryNormalized;

    if (!sportCanonical.has(sportNormalized.toLowerCase())) {
      missingSports.add(canonicalSport);
    }
    if (!categoryCanonical.has(categoryNormalized.toLowerCase())) {
      missingCategories.add(canonicalCategory);
    }

    usedSports.add(canonicalSport.toLowerCase());
    usedCategories.add(canonicalCategory.toLowerCase());

    if (sportRaw !== canonicalSport) {
      next.sport = canonicalSport;
    }
    if (categoryRaw !== canonicalCategory) {
      next.category = canonicalCategory;
    }

    if (Object.keys(next).length > 0) {
      plannedProductUpdates.push({
        _id: product._id,
        id: product.id || product._id.toString(),
        name: product.name || "(unnamed)",
        next,
      });
    }
  }

  const orphanSportDocs = taxonomyDocs
    .filter((doc) => doc.type === "sport")
    .filter((doc) => {
      const normalized = normalizeValue(doc.value);
      return normalized && !usedSports.has(normalized.toLowerCase());
    })
    .sort((left, right) => left.value.localeCompare(right.value));

  const orphanCategoryDocs = taxonomyDocs
    .filter((doc) => doc.type === "category")
    .filter((doc) => {
      const normalized = normalizeValue(doc.value);
      return normalized && !usedCategories.has(normalized.toLowerCase());
    })
    .sort((left, right) => left.value.localeCompare(right.value));

  return {
    plannedProductUpdates,
    invalidProducts,
    missingSports: Array.from(missingSports).sort((a, b) =>
      a.localeCompare(b),
    ),
    missingCategories: Array.from(missingCategories).sort((a, b) =>
      a.localeCompare(b),
    ),
    orphanSportDocs,
    orphanCategoryDocs,
    orphanSports: orphanSportDocs.map((doc) => normalizeValue(doc.value)),
    orphanCategories: orphanCategoryDocs.map((doc) =>
      normalizeValue(doc.value),
    ),
    taxonomyCounts: {
      sports: taxonomyDocs.filter((doc) => doc.type === "sport").length,
      categories: taxonomyDocs.filter((doc) => doc.type === "category").length,
    },
  };
}

async function fetchState(db) {
  const productsCollection = db.collection(productsCollectionName);
  const taxonomyCollection = db.collection(taxonomyCollectionName);

  const [products, taxonomyDocs] = await Promise.all([
    productsCollection
      .find(
        {},
        {
          projection: {
            _id: 1,
            id: 1,
            name: 1,
            sport: 1,
            category: 1,
          },
        },
      )
      .toArray(),
    taxonomyCollection
      .find(
        { type: { $in: ["sport", "category"] } },
        { projection: { _id: 1, type: 1, slug: 1, value: 1 } },
      )
      .toArray(),
  ]);

  return { productsCollection, taxonomyCollection, products, taxonomyDocs };
}

function printReport(header, report, productCount) {
  console.log("");
  console.log(header);
  console.log("=".repeat(header.length));
  console.log(`Products scanned: ${productCount}`);
  console.log(
    `Taxonomy entries: sports=${report.taxonomyCounts.sports}, categories=${report.taxonomyCounts.categories}`,
  );
  console.log(`Planned product updates: ${report.plannedProductUpdates.length}`);
  console.log(`Products with invalid sport/category: ${report.invalidProducts.length}`);
  console.log(`Missing taxonomy sports: ${report.missingSports.length}`);
  console.log(`Missing taxonomy categories: ${report.missingCategories.length}`);
  console.log(`Unused taxonomy sports: ${report.orphanSports.length}`);
  console.log(`Unused taxonomy categories: ${report.orphanCategories.length}`);
  console.log("");
  console.log(`Missing sports -> ${previewList(report.missingSports)}`);
  console.log(`Missing categories -> ${previewList(report.missingCategories)}`);
  console.log(`Unused sports -> ${previewList(report.orphanSports)}`);
  console.log(`Unused categories -> ${previewList(report.orphanCategories)}`);

  if (report.invalidProducts.length > 0) {
    const invalidPreview = report.invalidProducts
      .slice(0, PREVIEW_LIMIT)
      .map((item) => `${item.id} [sport="${item.sport}", category="${item.category}"]`)
      .join(" | ");
    console.log(`Invalid product preview -> ${invalidPreview}`);
  }
}

const client = new MongoClient(mongoUri);

try {
  await client.connect();
  const db = client.db(dbName);
  const { productsCollection, taxonomyCollection, products, taxonomyDocs } =
    await fetchState(db);

  const initialReport = analyzeSync(products, taxonomyDocs);
  printReport(
    mode === "fix"
      ? "Sport/Category Sync Report (before fix)"
      : "Sport/Category Sync Report (check only)",
    initialReport,
    products.length,
  );

  if (mode !== "fix") {
    console.log("");
    console.log('Check complete. Run with "--fix" to apply sync.');
    process.exit(0);
  }

  let productUpdateCount = 0;
  for (const update of initialReport.plannedProductUpdates) {
    await productsCollection.updateOne(
      { _id: update._id },
      {
        $set: {
          ...update.next,
          updatedAt: new Date(),
        },
      },
    );
    productUpdateCount += 1;
  }

  let taxonomyInsertCount = 0;
  const now = new Date();
  for (const sport of initialReport.missingSports) {
    const slug = slugify(sport);
    if (!slug) {
      continue;
    }
    const result = await taxonomyCollection.updateOne(
      { type: "sport", slug },
      {
        $set: {
          type: "sport",
          slug,
          value: sport,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      taxonomyInsertCount += 1;
    }
  }

  for (const category of initialReport.missingCategories) {
    const slug = slugify(category);
    if (!slug) {
      continue;
    }
    const result = await taxonomyCollection.updateOne(
      { type: "category", slug },
      {
        $set: {
          type: "category",
          slug,
          value: category,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          createdAt: now,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      taxonomyInsertCount += 1;
    }
  }

  let taxonomyDeleteCount = 0;
  for (const doc of initialReport.orphanSportDocs) {
    const result = await taxonomyCollection.deleteOne({ _id: doc._id });
    taxonomyDeleteCount += result.deletedCount;
  }
  for (const doc of initialReport.orphanCategoryDocs) {
    const result = await taxonomyCollection.deleteOne({ _id: doc._id });
    taxonomyDeleteCount += result.deletedCount;
  }

  const postState = await fetchState(db);
  const finalReport = analyzeSync(postState.products, postState.taxonomyDocs);
  printReport("Sport/Category Sync Report (after fix)", finalReport, postState.products.length);

  console.log("");
  console.log("Applied changes");
  console.log("---------------");
  console.log(`Products updated: ${productUpdateCount}`);
  console.log(`Taxonomy rows inserted: ${taxonomyInsertCount}`);
  console.log(`Taxonomy rows pruned: ${taxonomyDeleteCount}`);
  console.log(
    `Remaining invalid products: ${finalReport.invalidProducts.length}`,
  );
  console.log(
    `Remaining missing taxonomy values: ${
      finalReport.missingSports.length + finalReport.missingCategories.length
    }`,
  );
} catch (error) {
  console.error("Sport/category sync failed.", error);
  process.exitCode = 1;
} finally {
  await client.close();
}
