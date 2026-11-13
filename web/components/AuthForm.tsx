"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    setBusy(true);
    setError("");
    const res =
      mode === "register"
        ? await authClient.signUp.email({ email, password, name: String(f.get("name")) })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) return setError(res.error.message ?? "Something went wrong");
    router.push("/play");
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-10 flex max-w-sm flex-col gap-3">
      <h1 className="text-xl font-bold">{mode === "login" ? "Log in" : "Create your account"}</h1>
      {mode === "register" && <input name="name" required minLength={2} maxLength={24} placeholder="Username" className="input" />}
      <input name="email" type="email" required placeholder="Email" className="input" />
      <input name="password" type="password" required minLength={8} placeholder="Password (min 8 chars)" className="input" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy}>{mode === "login" ? "Log in" : "Sign up"}</button>
      <p className="text-sm text-stone-500">
        {mode === "login" ? (
          <>No account? <Link className="underline" href="/register">Sign up</Link></>
        ) : (
          <>Have an account? <Link className="underline" href="/login">Log in</Link></>
        )}
      </p>
    </form>
  );
}
