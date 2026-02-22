import { CircleHelp, Headset, ShieldCheck, Truck } from "lucide-react";

const faqItems: Array<{
  id: string;
  question: string;
  answer: string;
}> = [
  {
    id: "faq-order-tracking",
    question: "How can I track my order after checkout?",
    answer:
      "Go to Track Orders in the header or open your Account > Orders. Status updates are synced from payment and fulfillment events in real time.",
  },
  {
    id: "faq-shipping-window",
    question: "What shipping speed should I expect?",
    answer:
      "Most in-stock items ship within 1-2 business days. Delivery estimates appear in checkout and update once a carrier label is created.",
  },
  {
    id: "faq-returns",
    question: "Can I return or exchange an item?",
    answer:
      "Yes. Eligible products can be returned or exchanged during the return window. Open a support ticket with your order reference for faster handling.",
  },
  {
    id: "faq-payment-methods",
    question: "Which payment methods are supported?",
    answer:
      "You can use card checkout, PayPal, Google Pay (supported browsers), and bank transfer for approved flows.",
  },
  {
    id: "faq-bank-transfer",
    question: "What happens after selecting bank transfer?",
    answer:
      "Your order is created in awaiting transfer status. Once payment is reconciled, the order moves to completed and fulfillment continues normally.",
  },
  {
    id: "faq-account-security",
    question: "How do I secure my account?",
    answer:
      "Use a strong password, verify your email, and keep recovery access updated. For admin users, 2FA is supported for stronger authentication.",
  },
  {
    id: "faq-product-compare",
    question: "How does product compare work?",
    answer:
      "Add items to compare from product cards or detail pages. Your compare list is persisted and synced to your account when signed in.",
  },
  {
    id: "faq-support-response",
    question: "How fast does support respond?",
    answer:
      "Priority and category decide queue order. You can monitor ticket status from Support Center and receive updates when agents respond.",
  },
];

export function SupportFaqSection() {
  return (
    <section id="help-center" className="mt-7 scroll-mt-28">
      <article className="glass-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-surface-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            <CircleHelp className="h-4 w-4" />
            Help Center FAQ
          </p>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-surface-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            <Headset className="h-4 w-4" />
            Quick Answers
          </p>
        </div>

        <h2 className="mt-3 text-2xl font-semibold text-brand sm:text-3xl">
          Frequently Asked Questions
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          High-signal answers for checkout, shipping, returns, account security,
          and support operations.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {faqItems.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="group rounded-2xl border border-brand/15 bg-surface p-4"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-semibold text-brand">
                <span>{item.question}</span>
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand/15 text-xs text-muted transition group-open:rotate-45 group-open:text-brand">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {item.answer}
              </p>
            </details>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              <Truck className="h-4 w-4" />
              Shipping Guidance
            </p>
            <p className="mt-2 text-sm text-muted">
              Add order reference in tickets to speed shipping investigation and
              resolution.
            </p>
          </div>
          <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              <ShieldCheck className="h-4 w-4" />
              Security Note
            </p>
            <p className="mt-2 text-sm text-muted">
              Never share passwords or card details in support messages.
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}

