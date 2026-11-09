"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { HandCoins, Loader2, LockKeyhole, MapPin, Minus, Plus, Smartphone, Tag, X } from "lucide-react";
import { commerce, product } from "@/config/products";
import { siteConfig } from "@/config/site";
import {
  applyCouponAction,
  confirmPaymentAction,
  placeOrderAction,
  retryPaymentAction,
  switchToCodAction,
} from "@/app/(site)/checkout/actions";
import { trackPixel } from "@/lib/analytics/pixel";
import { findPack, type Storefront } from "@/lib/catalog/types";
import { uuid } from "@/lib/client-id";
import { INDIAN_STATES } from "@/lib/india";
import { formatPaise } from "@/lib/money";
import type { CheckoutPaymentOptions } from "@/lib/payments/flow";
import { loadRazorpay, openRazorpay } from "@/lib/payments/razorpay-client";
import { quote, QuoteError, type Coupon, type PaymentMethod, type Quote } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { checkoutSchema, fieldErrors, type CheckoutInput } from "@/lib/validation";
import { readAttribution } from "../analytics/attribution";
import { useCart, type CartLine } from "../cart/cart-context";
import { PackThumb } from "../product/pack-thumb";
import { useStorefront } from "../storefront-context";
import { buttonClasses } from "../ui/button";
import { Field, Honeypot, inputClasses, TextInput } from "../ui/field";
import { useCartLead } from "./use-cart-lead";

/** A discount code in the link (e.g. sent after a recovery call), if well-formed. */
function couponFromUrl(params: URLSearchParams): string | null {
  const code = params.get("coupon")?.trim().toUpperCase().slice(0, 30);
  return code && /^[A-Z0-9-]+$/.test(code) ? code : null;
}

const clampQty = (value: string | null | undefined) =>
  Math.min(Math.max(Number.parseInt(value ?? "1", 10) || 1, 1), commerce.maxQtyPerPack);

/**
 * Buy-now lines from the URL: ?pack=pack-50&qty=2 (ad links), or
 * ?items=pack-50:2,pack-25:1 (the link sent after a cart-recovery call).
 */
function linesFromUrl(params: URLSearchParams, storefront: Storefront): CartLine[] | null {
  const items = params.get("items");
  if (items) {
    const lines = items
      .split(",")
      .slice(0, commerce.maxLinesPerOrder)
      .map((item) => item.split(":"))
      .filter(([id], i, all) => findPack(storefront, id)?.available && all.findIndex(([other]) => other === id) === i)
      .map(([id, qty]) => ({ packId: id, qty: clampQty(qty) }));
    return lines.length ? lines : null;
  }
  const pack = findPack(storefront, params.get("pack"));
  if (!pack || !pack.available) return null;
  return [{ packId: pack.id, qty: clampQty(params.get("qty")) }];
}

/** A saved order whose online payment hasn't completed yet. */
type PendingPayment = { token: string; orderNumber: string; total: number };

function tryQuote(
  lines: CartLine[],
  paymentMethod: PaymentMethod,
  coupon: Coupon | null,
  storefront: Storefront,
): { quote: Quote | null; error: string | null } {
  if (!lines.length) return { quote: null, error: null };
  try {
    return { quote: quote({ lines, paymentMethod, coupon, catalog: storefront }), error: null };
  } catch (error) {
    return { quote: null, error: error instanceof QuoteError ? error.message : "Something went wrong." };
  }
}

export function CheckoutForm({ onlinePayments, recoveryCalls }: { onlinePayments: boolean; recoveryCalls: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cart = useCart();
  const storefront = useStorefront();

  const [buyNowLines, setBuyNowLines] = useState<CartLine[] | null>(() => linesFromUrl(searchParams, storefront));
  // A buy-now pack that sold out (or was hidden) while the customer was here drops out, like in the cart.
  const lines = useMemo(
    () => (buyNowLines ?? cart.lines).filter((l) => findPack(storefront, l.packId)?.available),
    [buyNowLines, cart.lines, storefront],
  );

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(onlinePayments ? "prepaid" : "cod");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponInput, setCouponInput] = useState(() => couponFromUrl(searchParams) ?? "");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponPending, startCouponTransition] = useTransition();

  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pinLookup, setPinLookup] = useState<"idle" | "loading" | "found" | "notfound">("idle");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const checkoutId = useRef(uuid());
  const formRef = useRef<HTMLFormElement>(null);

  // Tracked only to save the cart for a recovery call; the order itself reads the form on submit.
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [callConsent, setCallConsent] = useState(false);
  const cartLead = useCartLead({
    enabled: recoveryCalls,
    consent: callConsent,
    name: contactName,
    phone: contactPhone,
    lines,
  });

  // COD eligibility doesn't depend on the chosen method, so check it first.
  const codAvailable = useMemo(
    () => tryQuote(lines, "prepaid", coupon, storefront).quote?.codAvailable ?? true,
    [lines, coupon, storefront],
  );
  const method: PaymentMethod = paymentMethod === "cod" && !codAvailable && onlinePayments ? "prepaid" : paymentMethod;
  const { quote: totals, error: quoteError } = useMemo(
    () => tryQuote(lines, method, coupon, storefront),
    [lines, method, coupon, storefront],
  );

  // InitiateCheckout once the items are known.
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || !totals) return;
    tracked.current = true;
    trackPixel("InitiateCheckout", {
      content_ids: totals.lines.map((l) => l.sku),
      content_type: "product",
      currency: "INR",
      value: totals.subtotal / 100,
      num_items: totals.itemCount,
    });
  }, [totals]);

  function setLineQty(packId: string, qty: number) {
    if (buyNowLines) {
      setBuyNowLines((current) =>
        (current ?? [])
          .map((l) => (l.packId === packId ? { ...l, qty: Math.min(qty, commerce.maxQtyPerPack) } : l))
          .filter((l) => l.qty > 0),
      );
    } else {
      cart.setQty(packId, qty);
    }
  }

  async function lookupPincode(pin: string) {
    setPinLookup("loading");
    try {
      const res = await fetch(`/api/pincode/${pin}`);
      const data = (await res.json()) as { ok: boolean; city?: string; state?: string | null };
      if (data.ok && data.city) {
        setCity(data.city);
        if (data.state) setState(data.state);
        setPinLookup("found");
        setErrors((e) => ({ ...e, city: "", state: "", pincode: "" }));
      } else {
        setPinLookup("notfound");
      }
    } catch {
      setPinLookup("idle");
    }
  }

  // A code in the link (e.g. sent after a recovery call) is applied once, on arrival.
  const urlCouponApplied = useRef(false);
  useEffect(() => {
    if (urlCouponApplied.current) return;
    urlCouponApplied.current = true;
    const code = couponFromUrl(searchParams);
    if (code) applyCoupon(code);
    // Runs once on arrival; later URL changes don't re-apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyCoupon(typed?: string) {
    const code = (typed ?? couponInput).trim();
    if (!code) return;
    startCouponTransition(async () => {
      const res = await applyCouponAction(code);
      if (res.ok) {
        setCoupon(res.coupon);
        setCouponMessage(null);
      } else {
        setCoupon(null);
        setCouponMessage(res.error);
      }
    });
  }

  /**
   * Leaves checkout for the confirmation page. The browser Purchase event fires
   * here, never on /order/…, whose URL must not reach third parties.
   */
  function complete(order: PendingPayment, confirmed: boolean) {
    if (confirmed && totals) {
      trackPixel(
        "Purchase",
        {
          currency: "INR",
          value: order.total / 100,
          content_ids: totals.lines.map((l) => l.sku),
          content_type: "product",
          num_items: totals.itemCount,
        },
        order.orderNumber,
      );
    }
    if (!buyNowLines) cart.clear();
    cartLead.forget();
    router.push(`/order/${order.token}`);
  }

  async function pay(order: PendingPayment, payment: CheckoutPaymentOptions) {
    const loaded = await loadRazorpay();
    if (!loaded) {
      setPendingPayment(order);
      setFormError("The payment window couldn't load. Check your connection and try again.");
      return;
    }
    openRazorpay(payment, {
      onSuccess: (response) => {
        startTransition(async () => {
          const result = await confirmPaymentAction({
            orderToken: order.token,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (!result.ok) setFormError(result.error);
          complete(order, result.ok);
        });
      },
      onDismiss: () => setPendingPayment(order),
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fd = new FormData(event.currentTarget);
    const text = (key: string) => String(fd.get(key) ?? "");
    if (!totals) return;
    const input: CheckoutInput = {
      checkoutId: checkoutId.current,
      lines,
      paymentMethod: method,
      expectedTotal: totals.total,
      couponCode: coupon?.code,
      name: text("name"),
      phone: text("phone"),
      email: text("email"),
      address1: text("address1"),
      address2: text("address2"),
      landmark: text("landmark"),
      city,
      state: state as CheckoutInput["state"],
      pincode: text("pincode"),
      company: text("company"),
      attribution: readAttribution(),
    };

    const local = checkoutSchema.safeParse(input);
    if (!local.success) {
      const errs = fieldErrors(local.error);
      setErrors(errs);
      setFormError("Please check the highlighted fields.");
      focusFirstError(errs);
      return;
    }

    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await placeOrderAction(input);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        // Fetch the current prices; the summary updates and the customer can place the order again.
        if (result.priceChanged) router.refresh();
        // The order was saved but payment couldn't start: offer retry / COD on that order.
        if (result.order) setPendingPayment({ token: result.order.orderToken, ...result.order });
        if (result.fieldErrors) focusFirstError(result.fieldErrors);
        return;
      }
      const order = { token: result.orderToken, orderNumber: result.orderNumber, total: result.total };
      if (!result.payment) {
        complete(order, true);
        return;
      }
      await pay(order, result.payment);
    });
  }

  function focusFirstError(errs: Record<string, string>) {
    const first = Object.keys(errs).find((k) => errs[k]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
    el?.focus();
  }

  function retryPayment() {
    if (!pendingPayment) return;
    setFormError(null);
    startTransition(async () => {
      const res = await retryPaymentAction(pendingPayment.token);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      await pay(pendingPayment, res.payment);
    });
  }

  function switchToCod() {
    if (!pendingPayment) return;
    setFormError(null);
    startTransition(async () => {
      const res = await switchToCodAction(pendingPayment.token);
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      complete({ ...pendingPayment, total: res.total }, true);
    });
  }

  function editDetails() {
    // The unpaid order stays on record; a fresh id creates a new one on the next submit.
    setPendingPayment(null);
    setFormError(null);
    checkoutId.current = uuid();
  }

  if (!buyNowLines && !cart.hydrated) return <CheckoutSkeleton />;

  if (!lines.length || !totals) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-extrabold">{quoteError ? "Let's fix your cart" : "Your cart is empty"}</h1>
        <p className="mt-2 text-muted">{quoteError ?? "Pick a pack to get started."}</p>
        <Link href={`/products/${product.slug}`} className={buttonClasses("primary", "lg", "mt-6")}>
          {quoteError ? "Back to the shop" : "Shop sponges"}
        </Link>
      </div>
    );
  }

  const codFeePaise = storefront.codFee;
  const locked = pending || pendingPayment !== null;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="relative grid gap-8 lg:grid-cols-[1fr_400px] lg:items-start"
    >
      <Honeypot />
      <div className="space-y-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Checkout</h1>

        {/* Mobile summary */}
        <details className="rounded-2xl border border-line bg-surface lg:hidden">
          <summary className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
            <span>
              Order summary · {totals.itemCount} item{totals.itemCount > 1 ? "s" : ""}
            </span>
            <span className="text-base font-extrabold">{formatPaise(totals.total)}</span>
          </summary>
          <div className="border-t border-line p-4">
            <SummaryLines lines={totals.lines} onQty={setLineQty} disabled={locked} />
          </div>
        </details>

        <fieldset disabled={locked} className="space-y-4">
          <legend className="mb-4 text-lg font-bold">Contact</legend>
          <Field label="Full name" name="name" error={errors.name}>
            <TextInput
              name="name"
              autoComplete="name"
              placeholder="e.g. Priya Sharma"
              error={errors.name}
              onChange={(e) => setContactName(e.target.value)}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" name="phone" error={errors.phone} hint="For delivery updates from the courier">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">+91</span>
                <TextInput
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  maxLength={14}
                  error={errors.phone}
                  className="pl-13"
                  onChange={(e) => setContactPhone(e.target.value)}
                  required
                />
              </div>
            </Field>
            <Field label="Email" name="email" optional error={errors.email} hint="We'll email your order confirmation">
              <TextInput
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={errors.email}
              />
            </Field>
          </div>
          {recoveryCalls && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface px-4 py-3 text-sm">
              <input
                type="checkbox"
                name="callConsent"
                checked={callConsent}
                onChange={(e) => setCallConsent(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brand"
              />
              <span>
                If I don&apos;t finish my order, {siteConfig.name} may call me or message me on WhatsApp about this
                cart, sometimes with a discount.{" "}
                <span className="text-muted">The call is made by an AI assistant.</span>
              </span>
            </label>
          )}
        </fieldset>

        <fieldset disabled={locked} className="space-y-4">
          <legend className="mb-4 text-lg font-bold">Delivery address</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Pincode"
              name="pincode"
              error={errors.pincode}
              hint={
                pinLookup === "loading"
                  ? "Finding your city…"
                  : pinLookup === "notfound"
                    ? "Couldn't find this pincode, please fill city and state"
                    : undefined
              }
            >
              <TextInput
                name="pincode"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="6-digit pincode"
                maxLength={6}
                error={errors.pincode}
                onChange={(e) => {
                  const pin = e.target.value.replace(/\D/g, "").slice(0, 6);
                  e.target.value = pin;
                  if (/^[1-9]\d{5}$/.test(pin)) void lookupPincode(pin);
                  else setPinLookup("idle");
                }}
                required
              />
            </Field>
            <Field label="City / District" name="city" error={errors.city}>
              <TextInput
                name="city"
                autoComplete="address-level2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                error={errors.city}
                required
              />
            </Field>
            <Field label="State" name="state" error={errors.state}>
              <select
                id="state"
                name="state"
                autoComplete="address-level1"
                value={state}
                onChange={(e) => setState(e.target.value)}
                aria-invalid={errors.state ? true : undefined}
                className={cn(inputClasses, "select-chevron appearance-none pr-10")}
                required
              >
                <option value="">Select</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="House / flat no., building, street" name="address1" error={errors.address1}>
            <TextInput name="address1" autoComplete="address-line1" error={errors.address1} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Area / locality" name="address2" optional error={errors.address2}>
              <TextInput name="address2" autoComplete="address-line2" error={errors.address2} />
            </Field>
            <Field label="Landmark" name="landmark" optional error={errors.landmark}>
              <TextInput name="landmark" placeholder="e.g. near City Hospital" error={errors.landmark} />
            </Field>
          </div>
        </fieldset>

        <fieldset disabled={locked}>
          <legend className="mb-4 text-lg font-bold">Payment</legend>
          <div className="grid gap-3">
            {onlinePayments && (
              <PaymentOption
                checked={method === "prepaid"}
                onSelect={() => setPaymentMethod("prepaid")}
                icon={<Smartphone className="size-5" />}
                title="Pay online"
                subtitle="UPI, cards, netbanking, wallets"
                badge={codFeePaise > 0 ? `Save ${formatPaise(codFeePaise)}` : undefined}
              />
            )}
            <PaymentOption
              checked={method === "cod"}
              onSelect={() => codAvailable && setPaymentMethod("cod")}
              disabled={!codAvailable}
              icon={<HandCoins className="size-5" />}
              title="Cash on Delivery"
              subtitle={
                !codAvailable
                  ? `Available on orders up to ${formatPaise(storefront.codMaxOrderValue)}`
                  : codFeePaise > 0
                    ? `+${formatPaise(codFeePaise)} COD charge · pay when it arrives`
                    : "Pay when it arrives"
              }
            />
          </div>
        </fieldset>
      </div>

      {/* Summary + submit */}
      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-6">
          <h2 className="mb-4 hidden text-lg font-bold lg:block">Order summary</h2>
          <div className="hidden lg:block">
            <SummaryLines lines={totals.lines} onQty={setLineQty} disabled={locked} />
          </div>

          <div className="mt-4 border-t border-line pt-4">
            {coupon ? (
              <div className="flex items-center justify-between rounded-xl bg-success-soft px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-success">
                  <Tag className="size-4" /> {coupon.code} applied
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCoupon(null);
                    setCouponInput("");
                  }}
                  className="text-muted hover:text-ink"
                  aria-label="Remove coupon"
                  disabled={locked}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  aria-label="Coupon code"
                  placeholder="Coupon code"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                  className={cn(inputClasses, "h-10 text-sm uppercase")}
                  maxLength={30}
                  disabled={locked}
                />
                <button
                  type="button"
                  onClick={() => applyCoupon()}
                  disabled={couponPending || !couponInput.trim() || locked}
                  className={buttonClasses("outline", "sm", "h-10 shrink-0")}
                >
                  {couponPending ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                </button>
              </div>
            )}
            {(couponMessage || totals.couponError) && (
              <p className="mt-2 text-sm text-danger">{totals.couponError ?? couponMessage}</p>
            )}
          </div>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <Row label="Subtotal" value={formatPaise(totals.subtotal)} />
            {totals.discount > 0 && (
              <Row label={`Coupon (${totals.coupon?.code})`} value={`−${formatPaise(totals.discount)}`} accent />
            )}
            <Row label="Delivery" value="Free" accent />
            {totals.codFee > 0 && <Row label="COD charge" value={formatPaise(totals.codFee)} />}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="text-base font-bold">Total</dt>
              <dd className="text-2xl font-extrabold">{formatPaise(totals.total)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-muted">Inclusive of all taxes</p>
          {totals.mrpTotal - totals.subtotal + totals.discount > 0 && (
            <p className="mt-2 rounded-xl bg-success-soft px-3 py-2 text-center text-sm font-semibold text-success">
              You save {formatPaise(totals.mrpTotal - totals.subtotal + totals.discount)} on this order
            </p>
          )}
        </div>

        {formError && (
          <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
            {formError}
          </p>
        )}

        {pendingPayment ? (
          <div className="space-y-3 rounded-3xl border border-warn/30 bg-warn-soft p-5">
            <p className="font-bold">Payment not completed</p>
            <p className="text-sm text-ink-soft">
              Your order is saved. Try the payment again, or switch to Cash on Delivery.
            </p>
            <button
              type="button"
              onClick={retryPayment}
              disabled={pending}
              className={buttonClasses("primary", "lg", "w-full")}
            >
              {pending ? <Loader2 className="size-5 animate-spin" /> : `Try paying ${formatPaise(totals.total)} again`}
            </button>
            {codAvailable && (
              <button
                type="button"
                onClick={switchToCod}
                disabled={pending}
                className={buttonClasses("outline", "lg", "w-full")}
              >
                Pay on delivery instead{codFeePaise > 0 ? ` (+${formatPaise(codFeePaise)})` : ""}
              </button>
            )}
            <button
              type="button"
              onClick={editDetails}
              disabled={pending}
              className="w-full text-sm font-semibold text-muted hover:text-ink"
            >
              Change order details
            </button>
          </div>
        ) : (
          <button type="submit" disabled={pending} className={buttonClasses("primary", "lg", "h-14 w-full text-lg")}>
            {pending ? (
              <>
                <Loader2 className="size-5 animate-spin" /> Processing…
              </>
            ) : method === "prepaid" ? (
              <>
                <LockKeyhole className="size-5" /> Pay {formatPaise(totals.total)} securely
              </>
            ) : (
              <>Place order · {formatPaise(totals.total)}</>
            )}
          </button>
        )}

        <p className="flex items-start gap-2 text-xs text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span>
            Free delivery in {siteConfig.shipping.delivery}. By placing this order you agree to our{" "}
            <Link href="/policies/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/policies/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </span>
        </p>
      </aside>
    </form>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-semibold", accent && "text-success")}>{value}</dd>
    </div>
  );
}

function SummaryLines({
  lines,
  onQty,
  disabled,
}: {
  lines: { packId: string; name: string; count: number; qty: number; lineTotal: number; unitMrp: number }[];
  onQty: (packId: string, qty: number) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="space-y-4">
      {lines.map((line) => (
        <li key={line.packId} className="flex items-center gap-3">
          <PackThumb count={line.count} className="size-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{line.name}</p>
            <p className="text-xs text-muted">{line.count} sponges</p>
            <div
              className="mt-1 flex items-center rounded-full border border-line bg-white"
              style={{ width: "fit-content" }}
            >
              <button
                type="button"
                className="grid size-7 place-items-center disabled:opacity-40"
                onClick={() => onQty(line.packId, line.qty - 1)}
                disabled={disabled}
                aria-label={`Decrease ${line.name} quantity`}
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
              <button
                type="button"
                className="grid size-7 place-items-center disabled:opacity-40"
                onClick={() => onQty(line.packId, line.qty + 1)}
                disabled={disabled || line.qty >= commerce.maxQtyPerPack}
                aria-label={`Increase ${line.name} quantity`}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatPaise(line.lineTotal)}</p>
            {line.unitMrp * line.qty > line.lineTotal && (
              <p className="text-xs text-muted line-through">{formatPaise(line.unitMrp * line.qty)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PaymentOption({
  checked,
  onSelect,
  disabled,
  icon,
  title,
  subtitle,
  badge,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 transition-colors",
        checked ? "border-brand bg-brand-soft/60" : "border-line hover:border-ink/25",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-brand" : "border-line",
        )}
      >
        {checked && <span className="size-2.5 rounded-full bg-brand" />}
      </span>
      <span className="text-brand">{icon}</span>
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2 font-bold">
          {title}
          {badge && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">{badge}</span>}
        </span>
        <span className="block text-sm text-muted">{subtitle}</span>
      </span>
    </label>
  );
}

export function CheckoutSkeleton() {
  return (
    <div
      className="grid animate-pulse gap-8 lg:grid-cols-[1fr_400px]"
      role="status"
      aria-busy="true"
      aria-label="Loading checkout"
    >
      <div className="space-y-4">
        <div className="h-9 w-40 rounded-lg bg-surface" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-80 rounded-3xl bg-surface" />
    </div>
  );
}
