"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui";
import { api } from "@/lib/client/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email, password });
      const next = params.get("next");
      // Only allow same-site relative redirects.
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Could not sign in.";
      setError(`${reason.replace(/\.?$/, ".")} Check your email and password, then try again.`);
      setLoading(false);
    }
  }

  const input =
    "h-13 w-full rounded-full bg-surface px-5 text-[15px] outline-none ring-brand transition focus:bg-white focus:ring-2";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {params.get("expired") ? <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">Your session ended. Please sign in again.</p> : null}
      <label className="sr-only" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        autoCapitalize="none"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={error ? "login-error" : undefined}
        className={input}
      />
      <label className="sr-only" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        placeholder="Password"
        aria-describedby={error ? "login-error" : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={input}
      />
      <p id="login-error" role="alert" className={error ? "px-2 text-sm text-danger" : "sr-only"}>
        {error}
      </p>
      <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
        Sign in {loading ? null : <ArrowRight />}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink px-4 py-10">
      {/* soft brand glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-brand-bright/20 blur-[120px]" />
      <div className="relative w-full max-w-md animate-fade-up rounded-[var(--radius-canvas)] bg-canvas p-8 sm:p-10">
        <Logo className="text-[26px]" />
        <h1 className="mt-6 text-3xl font-medium tracking-tight">Welcome back</h1>
        <p className="mt-1.5 mb-8 text-muted">Sign in to see everything in one place.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
      <p className="relative mt-6 text-sm text-white/40">OmniRadar · private finance dashboard</p>
    </main>
  );
}
