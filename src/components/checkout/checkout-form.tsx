"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BadgePercent,
  Check,
  ChevronRight,
  ChevronUp,
  HandCoins,
  Loader2,
  LockKeyhole,
  MapPin,
  Minus,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Tag,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { commerce, product } from "@/config/products";
import { siteConfig } from "@/config/site";
import {
  applyCouponAction,
  confirmPaymentAction,
  placeOrderAction,
  retryPaymentAction,
  switchToCodAction,
} from "@/app/(site)/checkout/actions";
import {
  goToOrderPage,
  trackBeginCheckout,
  trackPaymentChoice,
  trackPinCheck,
  trackPurchasePixel,
} from "@/lib/analytics/track";
import { findPack, type Storefront } from "@/lib/catalog/types";
import { uuid } from "@/lib/client-id";
import { INDIAN_STATES } from "@/lib/india";
import { formatPaise } from "@/lib/money";
import type { CheckoutPaymentOptions } from "@/lib/payments/flow";
import { loadRazorpay, openRazorpay } from "@/lib/payments/razorpay-client";
import { quote, QuoteError, type Coupon, type PaymentMethod, type Quote } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { getConsent } from "@/lib/consent";
import { visitId } from "@/lib/visitors/tracker";
import { checkoutSchema, fieldErrors, type CheckoutInput } from "@/lib/validation";
import { readAttribution } from "../analytics/attribution";
import { useCart, type CartLine } from "../cart/cart-context";
import { fetchDelivery, PINCODE_KEY } from "../product/delivery-check";
import { PackThumb } from "../product/pack-thumb";

const UNSERVICEABLE = "Sorry, our couriers don't deliver to this pincode yet.";
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

/** Desktop layout (Tailwind's lg): the summary column replaces the phone's bottom bar. */
const WIDE = "(min-width: 64rem)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE).matches;

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
  // What the couriers said about the typed pincode (null: not asked, or no answer).
  const [pinCourier, setPinCourier] = useState<{
    pin: string;
    serviceable: boolean | null;
    cod: boolean | null;
  } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const checkoutId = useRef(uuid());
  const formRef = useRef<HTMLFormElement>(null);

  // Tracked to save the cart for a recovery call and to show "Delivering to" in the phone's bottom bar;
  // the order itself reads the form on submit.
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address1Text, setAddress1Text] = useState("");
  const [pincodeText, setPincodeText] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const payButtonRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  // The form error shows once: in the summary column on desktop, in the bottom bar on phones.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  // The bottom bar publishes its height so the cookie banner, footer and focused fields clear it (globals.css).
  const barRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--checkout-bar-h", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--checkout-bar-h");
    };
  }, []);
  const closePay = useCallback(() => {
    setPayOpen(false);
    payButtonRef.current?.focus();
  }, []);
  const [callConsent, setCallConsent] = useState(false);
  const cartLead = useCartLead({
    enabled: recoveryCalls,
    consent: callConsent,
    name: contactName,
    phone: contactPhone,
    lines,
  });

  // COD eligibility doesn't depend on the chosen method, so check it first.
  const codWithinLimit = useMemo(
    () => tryQuote(lines, "prepaid", coupon, storefront).quote?.codAvailable ?? true,
    [lines, coupon, storefront],
  );
  const codAtPincode = pinCourier?.cod !== false;
  const codAvailable = codWithinLimit && codAtPincode;
  const method: PaymentMethod = paymentMethod === "cod" && !codAvailable && onlinePayments ? "prepaid" : paymentMethod;
  const { quote: totals, error: quoteError } = useMemo(
    () => tryQuote(lines, method, coupon, storefront),
    [lines, method, coupon, storefront],
  );

  // What each method would cost, for the phone's payment sheet.
  const methodTotals = useMemo(
    () => ({
      prepaid: tryQuote(lines, "prepaid", coupon, storefront).quote?.total ?? null,
      cod: tryQuote(lines, "cod", coupon, storefront).quote?.total ?? null,
    }),
    [lines, coupon, storefront],
  );

  // A failed or dismissed payment shows its options card; bring it into view (on phones it sits at the top).
  useEffect(() => {
    if (pendingPayment) pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pendingPayment]);

  // InitiateCheckout once the items are known.
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || !totals) return;
    tracked.current = true;
    trackBeginCheckout(totals.lines, totals.subtotal, totals.itemCount);
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
    setPinCourier(null);
    // Couriers are asked alongside the city lookup; neither waits for the other.
    void fetchDelivery(pin).then((d) => {
      if (!d?.ok) return;
      trackPinCheck(pin, d.serviceable, d.cod, "checkout");
      setPinCourier({ pin, serviceable: d.serviceable, cod: d.cod });
      if (d.serviceable === false) setErrors((e) => ({ ...e, pincode: UNSERVICEABLE }));
      try {
        localStorage.setItem(PINCODE_KEY, pin);
      } catch {}
    });
    try {
      const res = await fetch(`/api/pincode/${pin}`);
      const data = (await res.json()) as { ok: boolean; city?: string; state?: string | null };
      if (data.ok && data.city) {
        setCity(data.city);
        if (data.state) setState(data.state);
        setPinLookup("found");
        setErrors((e) => ({ ...e, city: "", state: "", pincode: e.pincode === UNSERVICEABLE ? e.pincode : "" }));
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
    if (confirmed && totals) trackPurchasePixel(order.orderNumber, order.total, totals.lines, totals.itemCount);
    if (!buyNowLines) cart.clear();
    cartLead.forget();
    goToOrderPage((url) => router.push(url), `/order/${order.token}`);
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
      attribution: { ...readAttribution(), consent: getConsent() === "granted" ? "granted" : "denied" },
      visitId: visitId(),
    };

    const local = checkoutSchema.safeParse(input);
    if (!local.success) {
      const errs = fieldErrors(local.error);
      setErrors(errs);
      setFormError("Please check the highlighted fields.");
      focusFirstError(errs);
      return;
    }
    if (pinCourier?.pin === input.pincode && pinCourier.serviceable === false) {
      setErrors({ pincode: UNSERVICEABLE });
      setFormError(UNSERVICEABLE);
      focusFirstError({ pincode: UNSERVICEABLE });
      return;
    }

    setErrors({});
    setFormError(null);
    trackPaymentChoice(method, totals.lines, totals.total);
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
    // Centred, so the phone's fixed bottom bar never covers the field.
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** "Add" / "Change" in the phone's bottom bar: jump to the first empty detail (or the address). */
  function goToDetails() {
    const form = formRef.current;
    if (!form) return;
    const fields = ["name", "phone", "pincode", "address1"].map((n) =>
      form.querySelector<HTMLInputElement>(`input[name="${n}"]`),
    );
    const target = fields.find((el) => el && !el.value.trim()) ?? fields[3];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  // On phones the bottom bar can switch method only when both are possible.
  const canSwitch = onlinePayments && codAvailable;
  const mrpSaving = Math.max(totals.mrpTotal - totals.subtotal, 0);
  const savings = mrpSaving + totals.discount;
  const firstName = contactName.trim().split(/\s+/)[0] ?? "";
  const addressLine = [address1Text.trim(), [city.trim(), pincodeText].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const itemsLabel = `${totals.itemCount} item${totals.itemCount > 1 ? "s" : ""}`;
  const payOptions: PayOption[] = [
    {
      value: "prepaid",
      icon: Smartphone,
      title: "Pay online",
      subtitle: "UPI, cards, netbanking, wallets",
      total: methodTotals.prepaid,
      badge: codFeePaise > 0 ? `Save ${formatPaise(codFeePaise)}` : undefined,
    },
    {
      value: "cod",
      icon: HandCoins,
      title: "Cash on Delivery",
      subtitle:
        codFeePaise > 0 ? `+${formatPaise(codFeePaise)} COD charge · pay when it arrives` : "Pay when it arrives",
      total: methodTotals.cod,
    },
  ];

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      // Hides names, phone and address from Microsoft Clarity recordings.
      data-clarity-mask="true"
      // Phones: one column of cards above a fixed bottom bar. Both column wrappers are display: contents
      // there, so the cards' order-* classes set the sequence. Desktop: details left, sticky summary right.
      className="relative flex flex-col gap-3 pb-40 lg:grid lg:grid-cols-[1fr_400px] lg:items-start lg:gap-6 lg:pb-0"
    >
      <Honeypot />
      <div className="contents lg:block lg:space-y-4">
        <div className="order-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Checkout</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-success shadow-card">
            <ShieldCheck className="size-4" aria-hidden="true" /> Secure checkout
          </span>
        </div>

        <section id="delivery-details" aria-labelledby="details-title" className={cn(card, "order-4")}>
          <h2 id="details-title" className="flex items-center gap-3 font-extrabold">
            <IconTile icon={MapPin} /> Delivery details
          </h2>
          <fieldset disabled={locked} className="mt-5 space-y-4">
            <legend className={subheading}>Contact</legend>
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
              <Field
                label="Mobile number"
                name="phone"
                error={errors.phone}
                hint="For delivery updates from the courier"
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">
                    +91
                  </span>
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
              <Field
                label="Email"
                name="email"
                optional
                error={errors.email}
                hint="We'll email your order confirmation"
              >
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

          <fieldset disabled={locked} className="mt-6 space-y-4 border-t border-line pt-5">
            <legend className={cn(subheading, "float-left w-full")}>Delivery address</legend>
            <div className="clear-both grid gap-4 sm:grid-cols-3">
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
                    setPincodeText(pin);
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
              <TextInput
                name="address1"
                autoComplete="address-line1"
                error={errors.address1}
                onChange={(e) => setAddress1Text(e.target.value)}
                required
              />
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
        </section>

        <section className={cn(card, "order-5")}>
          <fieldset disabled={locked}>
            <legend className="float-left flex w-full items-center gap-3 font-extrabold">
              <IconTile icon={Wallet} /> Payment method
            </legend>
            <div className="clear-both grid gap-2.5 pt-4">
              {onlinePayments && (
                <PaymentOption
                  checked={method === "prepaid"}
                  onSelect={() => setPaymentMethod("prepaid")}
                  icon={Smartphone}
                  title="Pay online"
                  subtitle="UPI, cards, netbanking, wallets"
                  badge={codFeePaise > 0 ? `Save ${formatPaise(codFeePaise)}` : undefined}
                />
              )}
              <PaymentOption
                checked={method === "cod"}
                onSelect={() => codAvailable && setPaymentMethod("cod")}
                disabled={!codAvailable}
                icon={HandCoins}
                title="Cash on Delivery"
                subtitle={
                  !codAtPincode
                    ? "Not available for this pincode. Please pay online"
                    : !codAvailable
                      ? `Available on orders up to ${formatPaise(storefront.codMaxOrderValue)}`
                      : codFeePaise > 0
                        ? `+${formatPaise(codFeePaise)} COD charge · pay when it arrives`
                        : "Pay when it arrives"
                }
              />
            </div>
          </fieldset>
        </section>
      </div>

      <aside className="contents lg:sticky lg:top-24 lg:block lg:space-y-4">
        <section aria-labelledby="items-title" className={cn(card, "order-3")}>
          <div className="flex items-center gap-3">
            <IconTile icon={Truck} />
            <div className="min-w-0">
              <h2 id="items-title" className="font-extrabold">
                {totals.shippingFee === 0 ? "Free delivery" : "Delivery"} in {siteConfig.shipping.delivery}
              </h2>
              <p className="text-sm text-muted">
                Shipment of {itemsLabel} · dispatched within {siteConfig.shipping.dispatch}
              </p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <SummaryLines lines={totals.lines} onQty={setLineQty} disabled={locked} />
          </div>
        </section>

        <section aria-label="Coupon" className={cn(card, "order-6")}>
          {coupon ? (
            <div className="flex items-center gap-3">
              <IconTile icon={BadgePercent} />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{coupon.code} applied</p>
                {totals.discount > 0 && (
                  <p className="text-sm font-semibold text-success">You save {formatPaise(totals.discount)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCoupon(null);
                  setCouponInput("");
                }}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                aria-label="Remove coupon"
                disabled={locked}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <IconTile icon={Tag} />
              <input
                aria-label="Coupon code"
                placeholder="Have a coupon code?"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCoupon();
                  }
                }}
                className={cn(inputClasses, "h-11 min-w-0 flex-1 text-sm uppercase placeholder:normal-case")}
                maxLength={30}
                disabled={locked}
              />
              <button
                type="button"
                onClick={() => applyCoupon()}
                disabled={couponPending || !couponInput.trim() || locked}
                className="h-11 shrink-0 cursor-pointer rounded-xl px-3 text-sm font-extrabold text-brand hover:bg-brand-soft disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
              >
                {couponPending ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
              </button>
            </div>
          )}
          {(couponMessage || totals.couponError) && (
            <p className="mt-2 text-sm text-danger">{totals.couponError ?? couponMessage}</p>
          )}
        </section>

        <section aria-labelledby="bill-title" className={cn(card, "order-7")}>
          <h2 id="bill-title" className="font-extrabold">
            Bill details
          </h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <BillRow
              icon={ReceiptText}
              label="Items total"
              chip={mrpSaving > 0 ? `Saved ${formatPaise(mrpSaving)}` : undefined}
              strike={mrpSaving > 0 ? formatPaise(totals.mrpTotal) : undefined}
              value={formatPaise(totals.subtotal)}
            />
            {totals.discount > 0 && (
              <BillRow
                icon={BadgePercent}
                label={`Coupon (${totals.coupon?.code})`}
                value={`−${formatPaise(totals.discount)}`}
                accent
              />
            )}
            <BillRow
              icon={Truck}
              label="Delivery charge"
              value={totals.shippingFee > 0 ? formatPaise(totals.shippingFee) : "FREE"}
              accent={totals.shippingFee === 0}
            />
            {totals.codFee > 0 && <BillRow icon={HandCoins} label="COD charge" value={formatPaise(totals.codFee)} />}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-line pt-3">
            <p className="font-extrabold">Grand total</p>
            <p data-testid="grand-total" className="text-lg font-extrabold">
              {formatPaise(totals.total)}
            </p>
          </div>
          <p className="text-xs text-muted">Inclusive of all taxes</p>
          {savings > 0 && (
            <div className="mt-4 rounded-xl bg-success-soft px-3 py-2.5 text-success">
              <p className="flex items-center justify-between text-sm font-extrabold">
                <span>Your total savings</span>
                <span>{formatPaise(savings)}</span>
              </p>
              <p className="mt-0.5 text-xs">
                Includes{" "}
                {[
                  mrpSaving > 0 && `${formatPaise(mrpSaving)} off MRP`,
                  totals.discount > 0 && `${formatPaise(totals.discount)} coupon discount`,
                ]
                  .filter(Boolean)
                  .join(" and ")}
              </p>
            </div>
          )}
        </section>

        {pendingPayment && (
          <div
            ref={pendingRef}
            className="order-2 scroll-mt-24 space-y-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 sm:p-5"
          >
            <p className="font-bold">Payment not completed</p>
            <p className="text-sm text-ink-soft">
              Your order is saved. Try the payment again, or switch to Cash on Delivery.
            </p>
            {formError && (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {formError}
              </p>
            )}
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
        )}

        {!pendingPayment && (
          <div className="hidden space-y-3 lg:block">
            {formError && wide && (
              <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
                {formError}
              </p>
            )}
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
          </div>
        )}

        <section aria-labelledby="policy-title" className={cn(card, "order-8 text-sm")}>
          <h2 id="policy-title" className="flex items-center gap-2 font-extrabold">
            <RotateCcw className="size-4 text-muted" aria-hidden="true" /> Cancellation policy
          </h2>
          <p className="mt-1.5 text-muted">
            Cancel any time before your order is dispatched. If it arrives damaged, defective or wrong, tell us within{" "}
            {siteConfig.shipping.claimWindowDays} days of delivery for a replacement or refund.{" "}
            <Link href="/policies/refund" className="font-semibold text-brand hover:underline">
              Read the policy
            </Link>
          </p>
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            By placing this order you agree to our{" "}
            <Link href="/policies/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/policies/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </aside>

      {/* Phones: where it's going, how it's paid, and the button, always in reach. */}
      {!pendingPayment && (
        <div
          ref={barRef}
          data-checkout-bar
          className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-line bg-white shadow-[0_-12px_32px_-16px_rgb(14_42_31/0.3)] sm:px-[max(0px,calc((100%_-_42rem)/2))] lg:hidden"
        >
          {formError && !wide && (
            <p className="mx-4 mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={goToDetails}
            disabled={locked}
            className="flex w-full cursor-pointer items-center gap-3 px-4 pt-3 pb-2.5 text-left"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
              <MapPin className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">
                {addressLine ? `Delivering to ${firstName || "you"}` : "Add delivery address"}
              </span>
              <span className="block truncate text-xs text-muted">
                {addressLine || "Your name, phone and address, in one step"}
              </span>
            </span>
            <span className="shrink-0 text-sm font-extrabold text-brand">{addressLine ? "Change" : "Add"}</span>
          </button>
          <div className="flex items-center gap-3 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {canSwitch ? (
              <button
                ref={payButtonRef}
                type="button"
                onClick={() => setPayOpen(true)}
                disabled={locked}
                aria-haspopup="dialog"
                className="shrink-0 cursor-pointer text-left max-[359px]:hidden"
              >
                <PayUsing method={method} switchable />
              </button>
            ) : (
              <div className="shrink-0 max-[359px]:hidden">
                <PayUsing method={method} />
              </div>
            )}
            <button
              type="submit"
              disabled={pending}
              className="flex h-14 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-2xl bg-brand px-4 text-white shadow-lift transition-colors hover:bg-brand-dark disabled:opacity-70"
            >
              <span className="text-left leading-none">
                <span className="block text-base font-extrabold">{formatPaise(totals.total)}</span>
                <span className="mt-1 block text-[10px] font-bold tracking-wider uppercase">Total</span>
              </span>
              <span className="flex items-center gap-1 text-[15px] font-extrabold whitespace-nowrap">
                {pending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    {method === "prepaid" ? "Pay now" : "Place order"}
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </>
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {payOpen && canSwitch && (
        <PaymentSheet
          method={method}
          options={payOptions}
          onPick={(value) => {
            setPaymentMethod(value);
            closePay();
          }}
          onClose={closePay}
        />
      )}
    </form>
  );
}

const card = "rounded-2xl bg-white p-4 shadow-card sm:p-5";
const subheading = "mb-3 text-xs font-bold tracking-wider text-muted uppercase";

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

function BillRow({
  icon: Icon,
  label,
  value,
  chip,
  strike,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  chip?: string;
  strike?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex min-w-0 items-center gap-2 text-ink-soft">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="truncate">{label}</span>
        {chip && (
          <span className="shrink-0 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-bold text-success">
            {chip}
          </span>
        )}
      </dt>
      <dd className="shrink-0 text-right">
        {strike && <span className="mr-1.5 text-xs text-muted line-through">{strike}</span>}
        <span className={cn("font-semibold", accent && "text-success")}>{value}</span>
      </dd>
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
          <PackThumb count={line.count} className="size-16 border border-line" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{line.name}</p>
            <p className="text-xs text-muted">{line.count} sponges</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex h-8 items-center rounded-lg bg-brand text-white">
              <button
                type="button"
                className="grid h-full w-8 cursor-pointer place-items-center rounded-l-lg hover:bg-brand-dark disabled:cursor-default disabled:opacity-40"
                onClick={() => onQty(line.packId, line.qty - 1)}
                disabled={disabled}
                aria-label={`Decrease ${line.name} quantity`}
              >
                <Minus className="size-3.5" strokeWidth={3} />
              </button>
              <span className="w-5 text-center text-sm font-extrabold">{line.qty}</span>
              <button
                type="button"
                className="grid h-full w-8 cursor-pointer place-items-center rounded-r-lg hover:bg-brand-dark disabled:cursor-default disabled:opacity-40"
                onClick={() => onQty(line.packId, line.qty + 1)}
                disabled={disabled || line.qty >= commerce.maxQtyPerPack}
                aria-label={`Increase ${line.name} quantity`}
              >
                <Plus className="size-3.5" strokeWidth={3} />
              </button>
            </div>
            <p className="text-sm">
              {line.unitMrp * line.qty > line.lineTotal && (
                <span className="mr-1.5 text-xs text-muted line-through">{formatPaise(line.unitMrp * line.qty)}</span>
              )}
              <span className="font-extrabold">{formatPaise(line.lineTotal)}</span>
            </p>
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
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition-colors",
        checked ? "border-brand bg-brand-soft/50" : "border-line hover:border-ink/25",
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
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-bold">
          {title}
          {badge && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">{badge}</span>}
        </span>
        <span className="block text-sm text-muted">{subtitle}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-2",
          checked ? "border-brand" : "border-line",
        )}
      >
        {checked && <span className="size-2.5 rounded-full bg-brand" />}
      </span>
    </label>
  );
}

/** "Pay using" in the phone's bottom bar. */
function PayUsing({ method, switchable }: { method: PaymentMethod; switchable?: boolean }) {
  return (
    <>
      <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-muted uppercase">
        Pay using {switchable && <ChevronUp className="size-3" aria-hidden="true" />}
      </span>
      <span className="mt-0.5 block text-sm font-extrabold">
        {method === "prepaid" ? "UPI / Card" : "Cash on Delivery"}
      </span>
    </>
  );
}

type PayOption = {
  value: PaymentMethod;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  total: number | null;
  badge?: string;
};

/** Phone bottom sheet to switch payment method from the bottom bar. */
function PaymentSheet({
  method,
  options,
  onPick,
  onClose,
}: {
  method: PaymentMethod;
  options: PayOption[];
  onPick: (value: PaymentMethod) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end lg:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-sheet-title"
        className="animate-sheet-up relative w-full rounded-t-3xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 id="pay-sheet-title" className="text-lg font-extrabold">
            Choose payment method
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-surface"
          >
            <X className="size-5" />
          </button>
        </div>
        <div role="radiogroup" aria-labelledby="pay-sheet-title" className="mt-4 grid gap-2.5">
          {options.map(({ value, icon: Icon, title, subtitle, total, badge }) => {
            const selected = method === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPick(value)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-colors",
                  selected ? "border-brand bg-brand-soft/50" : "border-line",
                )}
              >
                <IconTile icon={Icon} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {title}
                    {badge && (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">{badge}</span>
                    )}
                  </span>
                  <span className="block text-sm text-muted">{subtitle}</span>
                </span>
                {total !== null && <span className="shrink-0 font-extrabold">{formatPaise(total)}</span>}
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full",
                    selected ? "bg-brand text-white" : "border-2 border-line",
                  )}
                >
                  {selected && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CheckoutSkeleton() {
  return (
    <div
      className="grid animate-pulse gap-3 lg:grid-cols-[1fr_400px] lg:gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading checkout"
    >
      <div className="space-y-3 lg:space-y-4">
        <div className="h-9 w-40 rounded-lg bg-white" />
        <div className="h-40 rounded-2xl bg-white" />
        <div className="h-96 rounded-2xl bg-white" />
      </div>
      <div className="hidden space-y-4 lg:block">
        <div className="h-48 rounded-2xl bg-white" />
        <div className="h-64 rounded-2xl bg-white" />
      </div>
    </div>
  );
}
