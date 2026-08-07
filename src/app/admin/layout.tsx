import Link from "next/link";
import { requireRole } from "@/lib/auth/requireRole";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await requireRole(["主管", "排班人員"]);

  const navLinks = [
    { href: "/admin", label: "今日總覽" },
    ...(adminUser.role === "主管"
      ? [
          { href: "/admin/positions", label: "崗位管理" },
          { href: "/admin/pt", label: "PT 名單" },
          { href: "/admin/abilities", label: "能力等級設定" },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-6">
          <span className="font-bold text-zinc-900 dark:text-zinc-50">排班系統</span>
          <nav className="flex items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
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
