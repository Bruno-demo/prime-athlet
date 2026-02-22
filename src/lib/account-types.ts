export interface BillingProfile {
  fullName: string;
  company: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  taxId: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  emailVerifiedAt: string | null;
}
