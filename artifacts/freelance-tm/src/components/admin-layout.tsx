import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ReactNode, useEffect } from "react";
import {
  LayoutDashboard,
  CreditCard,
  ArrowUpFromLine,
  Gavel,
  Users,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard, exact: true },
  { href: "/admin/payments", label: "Пополнения", icon: CreditCard },
  { href: "/admin/withdrawals", label: "Выплаты", icon: ArrowUpFromLine },
  { href: "/admin/disputes", label: "Споры", icon: Gavel },
  { href: "/admin/users", label: "Пользователи", icon: Users },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) { setLocation("/login"); return; }
      if (user && (user as any).role !== "admin") { setLocation("/"); return; }
    }
  }, [isLoading, isAuthenticated, user]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  if ((user as any).role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-destructive">
        Доступ запрещён
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-white/10 flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold text-lg">F</div>
              <span className="font-bold text-sm">FreelanceTM</span>
            </div>
          </Link>
          <div className="mt-2 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-primary font-medium">Admin Panel</span>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <div className="px-3 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{user.displayName || user.username}</div>
            <div className="text-[10px] text-primary mt-0.5">Администратор</div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
