# Sportiva

Professional sports e-commerce starter built with Next.js 16, React 19, TypeScript, and Tailwind CSS v4.

## Implemented features

- Homepage storefront (`/`) with featured products and commerce-focused sections
- Shop catalog (`/shop`) with filtering + sorting
- Categories discovery page (`/categories`)
- Reviews page (`/reviews`)
- Product detail pages (`/shop/[id]`)
- Product image galleries with multi-image carousel on detail pages
- Product-card image sliders with mobile swipe support
- Real client cart state with persistence (`localStorage`)
- Cart page (`/cart`) with quantity controls and order summary
- Multi-method checkout: Stripe card checkout, Google Pay (via Stripe wallet), PayPal, and bank transfer instructions
- Sport-specific icon system (football/basketball/running/training/outdoor)
- Stripe Checkout session endpoint (`/api/checkout-session`)
- Stripe webhook endpoint (`/api/webhooks/stripe`) for order status updates
- MongoDB repository integration for products and orders (with controlled fallback behavior)
- Secure authentication (sign-up/sign-in/sign-out) with hashed passwords + server-backed sessions
- Protected billing center (`/account/billing`) with billing profile management and order history
- Customer support center (`/support`) with ticket submission + authenticated ticket history
- Email verification flow with one-time tokens
- Password reset flow with secure reset tokens
- Admin auth hardening with role-based permissions + 2FA verification for admin sessions
- Server-side pagination/filtering for admin product and promotions datasets
- Immutable admin audit log for security and mutation tracking
- Admin user operations (role assignment overrides + force logout)
- Distributed admin mutation rate limiting with Mongo-backed shared buckets
- Server-side pagination/filter/search for admin order operations
- Admin taxonomy management (CRUD sports and categories with usage guards)
- Admin support queue (`/admin/support`) with status/priority/note updates and audit logging
- Optional S3-compatible media storage for admin uploads (with local fallback)

## Environment setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the values:

- `NEXT_PUBLIC_APP_URL`
- `MONGODB_URI`
- `MONGODB_DB`
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS` (optional, default `90000`)
- `MONGODB_CONNECT_TIMEOUT_MS` (optional, default `60000`)
- `MONGODB_SOCKET_TIMEOUT_MS` (optional, default `120000`)
- `MONGODB_MAX_POOL_SIZE` (optional, default `25`)
- `MONGODB_MIN_POOL_SIZE` (optional, default `0`)
- `MONGODB_CONNECT_RETRIES` (optional, default `1`)
- `MONGODB_CONNECT_RETRY_DELAY_MS` (optional, default `800`)
- `MONGODB_ADDRESS_FAMILY` (optional, `4` or `6` to force IPv4/IPv6)
- `MONGODB_PRODUCTS_COLLECTION`
- `MONGODB_ORDERS_COLLECTION`
- `MONGODB_USERS_COLLECTION`
- `MONGODB_SESSIONS_COLLECTION`
- `MONGODB_AUTH_TOKENS_COLLECTION`
- `MONGODB_SUPPORT_TICKETS_COLLECTION`
- `MONGODB_TAXONOMY_COLLECTION`
- `MONGODB_ADMIN_ASSIGNMENTS_COLLECTION`
- `MONGODB_ADMIN_AUDIT_COLLECTION`
- `MONGODB_ADMIN_RATE_LIMITS_COLLECTION`
- `MONGODB_SETTINGS_COLLECTION`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID` (optional; required for PayPal checkout)
- `PAYPAL_CLIENT_SECRET` (optional; required for PayPal checkout)
- `PAYPAL_ENV` (`sandbox` or `live`)
- `BANK_TRANSFER_BANK_NAME` (optional)
- `BANK_TRANSFER_ACCOUNT_NAME` (optional)
- `BANK_TRANSFER_ACCOUNT_NUMBER` (optional)
- `BANK_TRANSFER_IBAN` (optional)
- `BANK_TRANSFER_SWIFT` (optional)
- `BANK_TRANSFER_NOTE` (optional)
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `ADMIN_ROLE_ASSIGNMENTS` (e.g. `admin@example.com:owner,ops@example.com:manager`)
- `ADMIN_2FA_SECRETS` (e.g. `admin@example.com:BASE32SECRET`)
- `ADMIN_2FA_ENCRYPTION_KEY` (long random secret for encrypting stored admin 2FA keys)
- `ADMIN_REQUIRE_2FA`
- `ADMIN_MFA_MAX_AGE_SECONDS`
- `S3_BUCKET` (optional object storage bucket for admin media uploads)
- `S3_REGION`
- `S3_ENDPOINT` (optional for S3-compatible providers)
- `S3_FORCE_PATH_STYLE`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` (public CDN/base URL for uploaded media)

Admin access model:
- New sign-ups are standard client accounts.
- Admin roles are not auto-granted; only emails in admin assignments (or DB overrides from Admin User Management) can access admin APIs/pages.

Homepage hero data behavior:
- `/` is rendered dynamically so admin product updates appear immediately in hero cards.
- In production, homepage reads use live Mongo data.

## Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Stripe webhook (local)

Use Stripe CLI to forward webhook events:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Set `STRIPE_WEBHOOK_SECRET` from the CLI output.

## Production go/no-go gate

Run the full deployment gate with one command:

```bash
npm run prod:gate
```

This command is strict and fails fast on any blocker:
- Production environment preflight (`prod:preflight`)
- Lint (`lint`)
- Production build (`build`)

## Enforce branch protection

Use the helper script to require separate CI checks on `main` (default: `lint`, `build-prod`):

1. Create a GitHub token with repository administration permission.
2. Set token in your shell (`GITHUB_TOKEN` or `GH_TOKEN`).
3. Run:

```bash
npm run protect:branch -- -Owner YOUR_GH_OWNER -Repo YOUR_GH_REPO -Branch main -RequiredChecks lint,build-prod
```

Notes:
- If `origin` is a GitHub remote, `-Owner` and `-Repo` are optional.
- You can override required checks with `-RequiredChecks` (array or CSV).
- Legacy single-check option `-RequiredCheck` is still supported.
- The script enforces: required status check, PR review requirement, linear history, no force-push, and no deletion on protected branch.

## Project structure

- `src/app/page.tsx` - homepage
- `src/app/shop/page.tsx` - shop listing
- `src/app/shop/[id]/page.tsx` - product details
- `src/app/cart/page.tsx` - cart and checkout
- `src/app/auth/sign-in/page.tsx` - sign-in page
- `src/app/auth/sign-up/page.tsx` - sign-up page
- `src/app/auth/check-email/page.tsx` - post-signup verification page
- `src/app/auth/verify-email/page.tsx` - email verification token landing
- `src/app/auth/forgot-password/page.tsx` - password reset request page
- `src/app/auth/reset-password/page.tsx` - password reset form page
- `src/app/account/billing/page.tsx` - protected billing center
- `src/app/api/checkout-session/route.ts` - Stripe Checkout session API
- `src/app/api/webhooks/stripe/route.ts` - Stripe webhook receiver
- `src/app/api/paypal/return/route.ts` - PayPal capture + checkout return handler
- `src/app/api/auth/*` - authentication APIs
- `src/app/api/account/billing/route.ts` - billing profile API
- `src/app/api/admin/users/route.ts` - admin user role/revoke/force-logout operations
- `src/app/api/admin/taxonomy/route.ts` - admin sport/category taxonomy CRUD API
- `src/app/api/admin/audit/route.ts` - admin audit log query API
- `src/components/admin-taxonomy-panel.tsx` - admin taxonomy CRUD UI
- `src/components/cart-context.tsx` - cart state provider
- `src/components/admin-orders-panel.tsx` - paginated admin order operations panel
- `src/components/admin-security-ops-panel.tsx` - admin user + audit operations panel
- `src/lib/products-repository.ts` - Mongo-backed product repository
- `src/lib/orders-repository.ts` - Mongo-backed order repository
- `src/lib/admin-audit.ts` - immutable admin audit log repository
- `src/lib/admin-assignments-repository.ts` - admin role override persistence
- `src/lib/taxonomy-repository.ts` - taxonomy repository + usage validation
- `src/lib/media-storage.ts` - S3/local media storage abstraction
- `src/lib/users-repository.ts` - Mongo-backed users repository
- `src/lib/sessions-repository.ts` - Mongo-backed auth sessions repository
- `src/lib/auth-tokens-repository.ts` - one-time verification/reset tokens
- `src/lib/auth.ts` - auth/session hashing + cookie utilities
- `src/lib/auth-email.ts` - verification/reset email orchestration
- `src/lib/mailer.ts` - SMTP transactional email delivery
- `src/lib/mongodb.ts` - Mongo client/db helpers
- `src/lib/stripe.ts` - Stripe server helper
