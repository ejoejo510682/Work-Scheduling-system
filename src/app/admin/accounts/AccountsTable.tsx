"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; email: string; name: string; role: "主管" | "排班人員" };

const ROLES = ["主管", "排班人員"] as const;

export function AccountsTable({ initialAccounts }: { initialAccounts: Account[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("排班人員");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || !name.trim()) return;
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, name: name.trim(), role }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "新增失敗");
      return;
    }

    setEmail("");
    setPassword("");
    setName("");
    setRole("排班人員");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">角色</th>
            </tr>
          </thead>
          <tbody>
            {initialAccounts.map((a) => (
              <tr key={a.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">{a.name}</td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{a.email}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      a.role === "主管"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
                    }`}
                  >
                    {a.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleAdd}
        className="max-w-sm space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">新增帳號</h2>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">姓名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">密碼</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 個字元"
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">角色</label>
          <div className="flex gap-3">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                {r}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "新增中…" : "新增帳號"}
        </button>
      </form>
    </div>
  );
}
