import "server-only";

import { Collection, MongoServerError, ObjectId } from "mongodb";

import { AuthUser, BillingProfile } from "@/lib/account-types";
import { getMongoDatabase, isMongoConfigured } from "@/lib/mongodb";

interface AdminBackupCodeDocument {
  hash: string;
  usedAt: Date | null;
  createdAt: Date;
}

interface AdminTwoFactorDocument {
  totpSecretCiphertext: string;
  backupCodeSalt: string;
  backupCodes: AdminBackupCodeDocument[];
  enabledAt: Date;
  updatedAt: Date;
}

interface UserDocument {
  _id: ObjectId;
  email: string;
  displayName: string;
  passwordHash: string;
  accountType?: "client";
  billingProfile: BillingProfile | null;
  adminTwoFactor?: AdminTwoFactorDocument | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface UserAdminBackupCode {
  hash: string;
  usedAt: Date | null;
  createdAt: Date;
}

export interface UserAdminTwoFactorState {
  totpSecretCiphertext: string;
  backupCodeSalt: string;
  backupCodes: UserAdminBackupCode[];
  enabledAt: Date;
  updatedAt: Date;
}

export interface UserWithSensitiveFields extends AuthUser {
  passwordHash: string;
  billingProfile: BillingProfile | null;
  adminTwoFactor: UserAdminTwoFactorState | null;
}

export interface UserWithBilling extends AuthUser {
  billingProfile: BillingProfile | null;
  adminTwoFactorEnabledAt: string | null;
  adminBackupCodesRemaining: number;
}

export interface UserListItem extends AuthUser {
  billingProfile: BillingProfile | null;
}

interface BillingAddressPatch {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface BillingProfileSyncInput {
  userId?: string | null;
  email?: string | null;
  fullName?: string | null;
  company?: string | null;
  phone?: string | null;
  address?: BillingAddressPatch | null;
}

async function getUsersCollection(): Promise<Collection<UserDocument> | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  const db = await getMongoDatabase();
  const collection = db.collection<UserDocument>(
    process.env.MONGODB_USERS_COLLECTION || "users",
  );
  await collection.createIndex({ email: 1 }, { unique: true });
  return collection;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeBillingValue(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function isBillingProfileComplete(profile: BillingProfile): boolean {
  return (
    profile.fullName.length >= 2 &&
    profile.line1.length >= 3 &&
    profile.city.length >= 2 &&
    profile.state.length >= 2 &&
    profile.postalCode.length >= 3 &&
    profile.country.length >= 2
  );
}

function areBillingProfilesEqual(
  a: BillingProfile,
  b: BillingProfile,
): boolean {
  return (
    a.fullName === b.fullName &&
    a.company === b.company &&
    a.phone === b.phone &&
    a.line1 === b.line1 &&
    a.line2 === b.line2 &&
    a.city === b.city &&
    a.state === b.state &&
    a.postalCode === b.postalCode &&
    a.country === b.country &&
    a.taxId === b.taxId
  );
}

function mapAuthUser(document: UserDocument): AuthUser {
  return {
    id: document._id.toHexString(),
    email: document.email,
    displayName: document.displayName,
    createdAt: document.createdAt.toISOString(),
    lastLoginAt: document.lastLoginAt
      ? document.lastLoginAt.toISOString()
      : null,
    emailVerifiedAt: document.emailVerifiedAt
      ? document.emailVerifiedAt.toISOString()
      : null,
  };
}

function mapAdminTwoFactorState(
  value: UserDocument["adminTwoFactor"],
): UserAdminTwoFactorState | null {
  if (
    !value ||
    typeof value.totpSecretCiphertext !== "string" ||
    typeof value.backupCodeSalt !== "string" ||
    !(value.enabledAt instanceof Date) ||
    !(value.updatedAt instanceof Date) ||
    !Array.isArray(value.backupCodes)
  ) {
    return null;
  }

  const backupCodes = value.backupCodes
    .map((code): UserAdminBackupCode | null => {
      if (
        !code ||
        typeof code.hash !== "string" ||
        !(code.createdAt instanceof Date)
      ) {
        return null;
      }
      if (!(code.usedAt instanceof Date) && code.usedAt !== null) {
        return null;
      }

      return {
        hash: code.hash,
        usedAt: code.usedAt,
        createdAt: code.createdAt,
      };
    })
    .filter((code): code is UserAdminBackupCode => code !== null);

  return {
    totpSecretCiphertext: value.totpSecretCiphertext,
    backupCodeSalt: value.backupCodeSalt,
    backupCodes,
    enabledAt: value.enabledAt,
    updatedAt: value.updatedAt,
  };
}

function mapUserWithSensitiveFields(
  document: UserDocument,
): UserWithSensitiveFields {
  return {
    ...mapAuthUser(document),
    passwordHash: document.passwordHash,
    billingProfile: document.billingProfile,
    adminTwoFactor: mapAdminTwoFactorState(document.adminTwoFactor),
  };
}

function mapUserWithBilling(document: UserDocument): UserWithBilling {
  const adminTwoFactor = mapAdminTwoFactorState(document.adminTwoFactor);
  const adminBackupCodesRemaining =
    adminTwoFactor?.backupCodes.filter((code) => code.usedAt === null).length ??
    0;

  return {
    ...mapAuthUser(document),
    billingProfile: document.billingProfile,
    adminTwoFactorEnabledAt: adminTwoFactor
      ? adminTwoFactor.enabledAt.toISOString()
      : null,
    adminBackupCodesRemaining,
  };
}

function mapUserListItem(document: UserDocument): UserListItem {
  return {
    ...mapAuthUser(document),
    billingProfile: document.billingProfile,
  };
}

export async function createUser(params: {
  email: string;
  displayName: string;
  passwordHash: string;
}): Promise<UserWithBilling> {
  const collection = await getUsersCollection();
  if (!collection) {
    throw new Error("MongoDB is not configured for authentication.");
  }

  const now = new Date();
  const normalizedEmail = normalizeEmail(params.email);
  const result = await collection.insertOne({
    _id: new ObjectId(),
    email: normalizedEmail,
    displayName: params.displayName.trim(),
    passwordHash: params.passwordHash,
    accountType: "client",
    billingProfile: null,
    adminTwoFactor: null,
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  const inserted = await collection.findOne({ _id: result.insertedId });
  if (!inserted) {
    throw new Error("Failed to create user account.");
  }

  return mapUserWithBilling(inserted);
}

export function isDuplicateEmailError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

export async function findUserByEmail(
  email: string,
): Promise<UserWithSensitiveFields | null> {
  const collection = await getUsersCollection();
  if (!collection) {
    return null;
  }

  const user = await collection.findOne({ email: normalizeEmail(email) });
  return user ? mapUserWithSensitiveFields(user) : null;
}

export async function findUserById(
  userId: string,
): Promise<UserWithSensitiveFields | null> {
  const collection = await getUsersCollection();
  if (!collection) {
    return null;
  }

  if (!ObjectId.isValid(userId)) {
    return null;
  }

  const user = await collection.findOne({ _id: new ObjectId(userId) });
  return user ? mapUserWithSensitiveFields(user) : null;
}

export async function touchUserLastLogin(userId: string): Promise<void> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        lastLoginAt: now,
        updatedAt: now,
      },
    },
  );
}

export async function markUserEmailVerified(
  userId: string,
): Promise<UserWithBilling | null> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return null;
  }

  const objectId = new ObjectId(userId);
  const now = new Date();
  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        emailVerifiedAt: now,
        updatedAt: now,
      },
    },
  );

  const user = await collection.findOne({ _id: objectId });
  return user ? mapUserWithBilling(user) : null;
}

export async function updateUserPasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        passwordHash,
        updatedAt: now,
      },
    },
  );
}

export async function updateUserBillingProfile(
  userId: string,
  billingProfile: BillingProfile,
): Promise<UserWithBilling | null> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return null;
  }

  const now = new Date();
  const objectId = new ObjectId(userId);
  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        billingProfile,
        updatedAt: now,
      },
    },
  );

  const user = await collection.findOne({ _id: objectId });
  return user ? mapUserWithBilling(user) : null;
}

export async function syncUserBillingProfileFromPayment(
  input: BillingProfileSyncInput,
): Promise<UserWithBilling | null> {
  let user: UserWithSensitiveFields | null = null;

  const normalizedUserId =
    typeof input.userId === "string" ? input.userId.trim() : "";
  if (normalizedUserId.length > 0) {
    user = await findUserById(normalizedUserId);
  }

  const normalizedEmail =
    typeof input.email === "string" && input.email.trim().length > 0
      ? normalizeEmail(input.email)
      : "";
  if (!user && normalizedEmail) {
    user = await findUserByEmail(normalizedEmail);
  }

  if (!user) {
    return null;
  }

  const existing = user.billingProfile;
  const address = input.address || {};

  const fullNameIncoming = sanitizeBillingValue(input.fullName, 80);
  const companyIncoming = sanitizeBillingValue(input.company, 80);
  const phoneIncoming = sanitizeBillingValue(input.phone, 30);
  const line1Incoming = sanitizeBillingValue(address.line1, 100);
  const line2Incoming = sanitizeBillingValue(address.line2, 100);
  const cityIncoming = sanitizeBillingValue(address.city, 80);
  const stateIncoming = sanitizeBillingValue(address.state, 60);
  const postalIncoming = sanitizeBillingValue(address.postalCode, 20);
  const countryIncoming = sanitizeBillingValue(address.country, 60);

  const nextProfile: BillingProfile = {
    fullName:
      fullNameIncoming ||
      existing?.fullName ||
      sanitizeBillingValue(user.displayName, 80),
    company: companyIncoming || existing?.company || "",
    phone: phoneIncoming || existing?.phone || "",
    line1: line1Incoming || existing?.line1 || "",
    line2: line2Incoming || existing?.line2 || "",
    city: cityIncoming || existing?.city || "",
    state: stateIncoming || existing?.state || "",
    postalCode: postalIncoming || existing?.postalCode || "",
    country: countryIncoming || existing?.country || "",
    taxId: existing?.taxId || "",
  };

  if (!isBillingProfileComplete(nextProfile)) {
    return getUserWithBillingProfile(user.id);
  }

  if (existing && areBillingProfilesEqual(existing, nextProfile)) {
    return getUserWithBillingProfile(user.id);
  }

  return updateUserBillingProfile(user.id, nextProfile);
}

export async function getUserWithBillingProfile(
  userId: string,
): Promise<UserWithBilling | null> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return null;
  }

  const user = await collection.findOne({ _id: new ObjectId(userId) });
  return user ? mapUserWithBilling(user) : null;
}

export async function getUserAdminTwoFactorState(
  userId: string,
): Promise<UserAdminTwoFactorState | null> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return null;
  }

  const user = await collection.findOne({ _id: new ObjectId(userId) });
  if (!user) {
    return null;
  }

  return mapAdminTwoFactorState(user.adminTwoFactor);
}

export async function setUserAdminTwoFactorState(params: {
  userId: string;
  totpSecretCiphertext: string;
  backupCodeSalt: string;
  backupCodeHashes: string[];
}): Promise<void> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { _id: new ObjectId(params.userId) },
    {
      $set: {
        adminTwoFactor: {
          totpSecretCiphertext: params.totpSecretCiphertext,
          backupCodeSalt: params.backupCodeSalt,
          backupCodes: params.backupCodeHashes.map((hash) => ({
            hash,
            usedAt: null,
            createdAt: now,
          })),
          enabledAt: now,
          updatedAt: now,
        },
        updatedAt: now,
      },
    },
  );
}

export async function clearUserAdminTwoFactorState(
  userId: string,
): Promise<void> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(userId)) {
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        adminTwoFactor: null,
        updatedAt: now,
      },
    },
  );
}

export async function consumeUserAdminBackupCode(params: {
  userId: string;
  backupCodeHash: string;
}): Promise<boolean> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return false;
  }

  const now = new Date();
  const result = await collection.updateOne(
    {
      _id: new ObjectId(params.userId),
      adminTwoFactor: { $ne: null },
      "adminTwoFactor.backupCodes": {
        $elemMatch: {
          hash: params.backupCodeHash,
          usedAt: null,
        },
      },
    },
    {
      $set: {
        "adminTwoFactor.backupCodes.$.usedAt": now,
        "adminTwoFactor.updatedAt": now,
        updatedAt: now,
      },
    },
  );

  return result.modifiedCount > 0;
}

export async function replaceUserAdminBackupCodes(params: {
  userId: string;
  backupCodeSalt: string;
  backupCodeHashes: string[];
}): Promise<void> {
  const collection = await getUsersCollection();
  if (!collection || !ObjectId.isValid(params.userId)) {
    return;
  }

  const now = new Date();
  await collection.updateOne(
    { _id: new ObjectId(params.userId), adminTwoFactor: { $ne: null } },
    {
      $set: {
        "adminTwoFactor.backupCodeSalt": params.backupCodeSalt,
        "adminTwoFactor.backupCodes": params.backupCodeHashes.map((hash) => ({
          hash,
          usedAt: null,
          createdAt: now,
        })),
        "adminTwoFactor.updatedAt": now,
        updatedAt: now,
      },
    },
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getUsersPage(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
}): Promise<{
  users: UserListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const page = Math.min(Math.max(Math.floor(params?.page ?? 1), 1), 100_000);
  const pageSize = Math.min(
    Math.max(Math.floor(params?.pageSize ?? 20), 1),
    100,
  );

  const collection = await getUsersCollection();
  if (!collection) {
    return {
      users: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 1,
      },
    };
  }

  const q = typeof params?.q === "string" ? params.q.trim() : "";
  const filter =
    q.length > 0
      ? {
          $or: [
            { email: { $regex: escapeRegex(q), $options: "i" } },
            { displayName: { $regex: escapeRegex(q), $options: "i" } },
          ],
        }
      : {};

  const [total, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);

  return {
    users: docs.map((doc) => mapUserListItem(doc)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
