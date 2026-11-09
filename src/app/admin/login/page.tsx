import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoMark } from "@/components/art";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <main data-admin-theme className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <LogoMark className="size-8" />
          <span className="text-lg font-extrabold">Store admin</span>
        </div>
        <Suspense fallback={<div className="h-56" />}>
          {searchParams.then((sp) => (
            <LoginForm next={typeof sp.next === "string" ? sp.next : undefined} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}
