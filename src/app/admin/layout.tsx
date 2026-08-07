import { requireRole } from "@/lib/auth/requireRole";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await requireRole(["主管", "排班人員"]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="font-bold text-zinc-900 dark:text-zinc-50">排班系統</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {adminUser.name}・{adminUser.role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
