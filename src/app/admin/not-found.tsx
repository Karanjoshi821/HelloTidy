import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24 text-center">
      <div>
        <h1 className="text-2xl font-extrabold">Not found</h1>
        <p className="mt-2 text-muted">That order or page doesn&apos;t exist.</p>
        <Link href="/admin/orders" className={buttonClasses("primary", "md", "mt-6")}>
          Back to orders
        </Link>
      </div>
    </main>
  );
}
