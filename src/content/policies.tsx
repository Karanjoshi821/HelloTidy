import Link from "next/link";
import type { ReactNode } from "react";
import { commerce } from "@/config/products";
import { formattedAddress, isPlaceholder, siteConfig } from "@/config/site";
import { formatPaise } from "@/lib/money";

/**
 * Policy pages required by Razorpay and the Consumer Protection (E-Commerce)
 * Rules, 2020. Written in plain English for customers. Have a lawyer review
 * them once your business details are final.
 */

/** Checkout settings from the database (paise), so the policies always match what checkout charges. */
export type PolicySettings = { codFee: number; codMaxOrderValue: number };

export type Policy = {
  slug: string;
  title: string;
  description: string;
  body: (settings: PolicySettings) => ReactNode;
};

const business = () => (isPlaceholder(siteConfig.legalName) ? siteConfig.name : siteConfig.legalName);
const s = siteConfig.shipping;
const c = siteConfig.contact;
const go = siteConfig.grievanceOfficer;

function ContactBlock() {
  return (
    <ul>
      <li>
        Email: <a href={`mailto:${c.email}`}>{c.email}</a>
      </li>
      <li>Phone / WhatsApp: {c.phoneDisplay}</li>
      <li>
        Or use our <Link href="/contact">contact page</Link>.
      </li>
    </ul>
  );
}

function GrievanceBlock() {
  return (
    <>
      <p>In line with the Consumer Protection (E-Commerce) Rules, 2020, our Grievance Officer is:</p>
      <p>
        <strong>{go.name}</strong>, {go.designation}
        <br />
        {business()}, {formattedAddress()}
        <br />
        Email: {go.email} · Phone: {go.phone}
      </p>
      <p>We acknowledge every complaint within 48 hours and resolve it within one month of receiving it.</p>
    </>
  );
}

export const policies: Policy[] = [
  {
    slug: "shipping",
    title: "Shipping Policy",
    description: `Free delivery across India. Orders are dispatched within ${s.dispatch} and delivered in ${s.delivery}.`,
    body: ({ codFee, codMaxOrderValue }) => (
      <>
        <h2>Delivery charges</h2>
        <p>
          Delivery is <strong>free on every order</strong> across India, with no minimum order value. For Cash on
          Delivery orders, a COD charge of {formatPaise(codFee)} applies and is shown before you place your order.
        </p>

        <h2>Dispatch and delivery time</h2>
        <ul>
          <li>We dispatch orders within {s.dispatch} of confirmation (excluding Sundays and public holidays).</li>
          <li>Delivery usually takes {s.delivery} after dispatch, depending on your pincode.</li>
          <li>
            Remote areas (North-East states, Jammu &amp; Kashmir, Ladakh, Andaman &amp; Nicobar and Lakshadweep) can
            take a few extra days.
          </li>
        </ul>

        <h2>Where we ship</h2>
        <p>
          We ship to serviceable pincodes across India through reputed courier partners. We do not ship outside India at
          the moment. If your pincode turns out to be unserviceable after you order, we will contact you, and refund any
          online payment in full.
        </p>

        <h2>Tracking</h2>
        <p>
          Once your order is dispatched, the courier name and tracking number appear on our{" "}
          <Link href="/track">Track Order</Link> page. Enter your order number and phone number to see them.
        </p>

        <h2>Cash on Delivery</h2>
        <p>
          COD is available on orders up to {formatPaise(codMaxOrderValue)}. Please keep the exact amount ready.
          Repeatedly refusing COD deliveries may lead us to offer only online payment on future orders from that phone
          number.
        </p>

        <h2>Failed deliveries</h2>
        <p>
          Please give a complete address and a reachable phone number. If the courier cannot deliver after its delivery
          attempts (wrong address, phone unreachable, or delivery refused) and the parcel comes back to us, we will
          refund prepaid orders after deducting the actual forward and return shipping cost.
        </p>

        <h2>Damaged parcels</h2>
        <p>
          If the parcel looks tampered with or badly damaged at delivery, please refuse it or take photos before
          opening. See our <Link href="/policies/refund">Cancellation &amp; Refund Policy</Link> for how we make it
          right.
        </p>

        <h2>Questions</h2>
        <ContactBlock />
      </>
    ),
  },
  {
    slug: "refund",
    title: "Cancellation & Refund Policy",
    description: `Cancel any time before dispatch. Damaged, defective or wrong items are replaced or refunded if reported within ${s.claimWindowDays} days of delivery.`,
    body: () => (
      <>
        <h2>Cancelling an order</h2>
        <p>
          You can cancel your order <strong>any time before it is dispatched</strong>. Message us on WhatsApp, email us,
          or use the <Link href="/contact">contact page</Link> with your order number. Prepaid orders cancelled before
          dispatch are refunded in full.
        </p>
        <p>
          Once an order has been dispatched it can&apos;t be cancelled. Please don&apos;t refuse a COD delivery you no
          longer want, since it costs us shipping both ways. Contact us instead and we&apos;ll help.
        </p>

        <h2>Damaged, defective or wrong items</h2>
        <p>
          If your order arrives damaged, defective, short or different from what you ordered, tell us within{" "}
          <strong>{s.claimWindowDays} days of delivery</strong>. Send your order number with photos of the items and
          packaging (an unboxing video helps). After a quick check, we will send a <strong>free replacement</strong> or
          give a <strong>full refund</strong>, whichever you prefer. For low-value items we usually won&apos;t ask you
          to send anything back.
        </p>

        <h2>What isn&apos;t covered</h2>
        <ul>
          <li>
            Melamine sponges are consumables that wear down with use, like an eraser. Wear from normal use is not a
            defect.
          </li>
          <li>Used items, unless they were defective.</li>
          <li>
            Damage to surfaces from using the sponge where our instructions say not to (for example glossy or polished
            finishes, car paint, non-stick coatings or skin).
          </li>
          <li>Change-of-mind returns on opened packs.</li>
        </ul>

        <h2>Refund timelines</h2>
        <ul>
          <li>We process approved refunds within 2 working days.</li>
          <li>
            Online payments are refunded to the original payment method. Banks usually take {s.refundDays} to show the
            refund.
          </li>
          <li>For Cash on Delivery orders, we refund to your UPI ID or bank account.</li>
        </ul>

        <h2>How to request a cancellation or refund</h2>
        <ContactBlock />
        <GrievanceBlock />
      </>
    ),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    description:
      "How we collect, use and protect your personal data, in line with the Digital Personal Data Protection Act, 2023.",
    body: () => (
      <>
        <p>
          This policy explains how {business()} (&quot;{siteConfig.name}&quot;, &quot;we&quot;) handles your personal
          data when you visit {siteConfig.url.replace(/^https?:\/\//, "")} or buy from us. We follow the Digital
          Personal Data Protection Act, 2023 and the Information Technology Act, 2000.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Order details:</strong> your name, mobile number, email (optional), delivery address and what you
            ordered.
          </li>
          <li>
            <strong>Payment status:</strong> payments are processed by Razorpay. We never see or store your card, UPI
            PIN or banking passwords; we only receive a payment reference and status.
          </li>
          <li>
            <strong>Messages:</strong> what you send us through the contact form, WhatsApp or email.
          </li>
          <li>
            <strong>Unfinished checkouts:</strong> if you tick the box at checkout agreeing to a call, we save your
            name, mobile number and cart before you place the order, and a short summary of any call we make to you.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser and device type, the ad or link that brought you here
            (UTM tags), and cookies such as Meta Pixel cookies. Your cart is saved in your own browser.
          </li>
        </ul>

        <h2>Why we use it</h2>
        <ul>
          <li>
            To process, deliver and support your order, including sharing delivery details with our courier partners.
          </li>
          <li>
            Only if you agreed at checkout: to call you, or message you on WhatsApp, about a cart you left unfinished,
            sometimes with a one-time discount. The call is made by an AI voice assistant. Untick the box, or say “don’t
            call me” on the call, and we won’t call that number again.
          </li>
          <li>To prevent fraud and fake orders (for example, Cash on Delivery abuse).</li>
          <li>To meet legal, tax and accounting obligations.</li>
          <li>
            To measure and improve our advertising. We use the Meta Pixel and Meta Conversions API, which share purchase
            events with Meta. Your phone number and email are hashed (irreversibly scrambled) before being shared.
          </li>
        </ul>
        <p>We do not sell your personal data.</p>

        <h2>Who we share it with</h2>
        <ul>
          <li>Logistics partners and couriers (name, phone, address) to deliver your order.</li>
          <li>Razorpay, our payment gateway, to process payments and refunds.</li>
          <li>Meta Platforms, for ad measurement as described above.</li>
          <li>
            If you agreed to a cart call: our calling, speech and AI providers (Plivo, Sarvam AI and Anthropic), who
            place the call and process its audio and transcript for us, and WhatsApp (Meta) if we message you.
          </li>
          <li>Service providers who host our website, database and email, under confidentiality obligations.</li>
          <li>Government authorities, only when required by law.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>
          We keep order records for as long as tax and accounting laws require. Contact messages are kept for up to 24
          months. Unfinished-checkout details are kept for up to 90 days; if you asked us not to call, we keep only your
          number, so that we never call it again. Technical and analytics data is kept for up to 12 months.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask to access, correct or erase your personal data, or withdraw consent for marketing, by contacting
          us. We may need to keep some order data where the law requires it. You can also block cookies in your browser
          and manage ad preferences in your Meta account settings.
        </p>

        <h2>Security</h2>
        <p>
          Our website runs over HTTPS. Access to order data is limited to authorised staff with individual,
          password-protected accounts, and we keep only the data we need.
        </p>

        <h2>Children</h2>
        <p>Our store is meant for adults. We do not knowingly collect data from children under 18.</p>

        <h2>Contact and grievances</h2>
        <ContactBlock />
        <GrievanceBlock />

        <h2>Changes to this policy</h2>
        <p>If we change this policy, we will update the date on this page.</p>
      </>
    ),
  },
  {
    slug: "terms",
    title: "Terms & Conditions",
    description: `The terms that apply when you use the ${siteConfig.name} website and buy our products.`,
    body: ({ codFee, codMaxOrderValue }) => (
      <>
        <p>
          These terms apply to your use of this website and to every order you place with {business()}, registered at{" "}
          {formattedAddress()}. By placing an order you agree to them.
        </p>

        <h2>Products</h2>
        <p>
          We sell melamine foam cleaning sponges (&quot;magic eraser&quot; sponges). We describe them as accurately as
          we can, but results depend on the surface and the stain. Always follow the usage instructions and cautions on
          the product page and the pack, and test on a small hidden area first.
        </p>
        <p>
          &quot;Magic Eraser&quot; is used on this site only to describe the type of product. {siteConfig.name} is not
          affiliated with any other brand.
        </p>

        <h2>Prices and payment</h2>
        <ul>
          <li>
            Prices are in Indian Rupees and {siteConfig.gstin ? "include GST" : "are final, with no tax added"}. Delivery
            is free.
          </li>
          <li>
            A Cash on Delivery charge of {formatPaise(codFee)} applies to COD orders and is shown before you order. COD
            is available on orders up to {formatPaise(codMaxOrderValue)}.
          </li>
          <li>Online payments are processed securely by Razorpay.</li>
          <li>The price you pay is the price shown at checkout when you place the order.</li>
        </ul>

        <h2>Order acceptance</h2>
        <p>
          An order is confirmed when you see the confirmation page. We may cancel an order, with a full refund of any
          payment, if a product is unavailable, the pincode can&apos;t be serviced, there is an obvious pricing error,
          or we reasonably suspect fraud or misuse. You may order up to {commerce.maxQtyPerPack} units of each pack at a
          time. For bulk orders, please <Link href="/contact">contact us</Link>.
        </p>

        <h2>Shipping, cancellations and refunds</h2>
        <p>
          See our <Link href="/policies/shipping">Shipping Policy</Link> and{" "}
          <Link href="/policies/refund">Cancellation &amp; Refund Policy</Link>.
        </p>

        <h2>Safe use</h2>
        <p>
          The sponges are mildly abrasive. Do not use them on skin, car paint, glossy or polished finishes, non-stick
          cookware, screens or finished wood. Keep them away from children and pets. We are not responsible for damage
          caused by use against these instructions.
        </p>

        <h2>Liability</h2>
        <p>
          To the extent the law allows, our total liability for any order is limited to the amount you paid for that
          order. Nothing in these terms limits your rights under the Consumer Protection Act, 2019.
        </p>

        <h2>Intellectual property</h2>
        <p>
          The {siteConfig.name} name, logo, text and images on this site belong to us and may not be copied without
          permission.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of India. Disputes are subject to the jurisdiction of the courts at{" "}
          {siteConfig.address.city}.
        </p>

        <h2>Contact and grievances</h2>
        <ContactBlock />
        <GrievanceBlock />
      </>
    ),
  },
];

export function getPolicy(slug: string): Policy | undefined {
  return policies.find((p) => p.slug === slug);
}
