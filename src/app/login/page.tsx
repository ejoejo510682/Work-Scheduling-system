"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("帳號或密碼錯誤，請再試一次");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="mb-6 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          排班系統登入
        </h1>

        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />

        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          密碼
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />

        {error && (
          <p className="mb-4 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
