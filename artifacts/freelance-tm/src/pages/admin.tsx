import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, ShoppingBag, Gavel, ClipboardList, Star,
  Wallet, Lock, BarChart3, RefreshCw, Loader2,
  AlertCircle, CreditCard, ArrowUpFromLine,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Stats {
  totalUsers: number;
  totalFreelancers: number;
  totalOrders: number;
  pendingOrders: number;
  activeOrders: number;
  totalGigs: number;
  pendingPayments: number;
  totalDisputes: number;
  openDisputes: number;
  pendingReviews: number;
  pendingGigs: number;
  pendingWithdrawals: number;
  totalBalanceNano: string;
  escrowLockedNano: string;
  platformFeeRevenueNano: string;
}

function nanoToTon(nano: string): string {
  if (!nano) return "0";
  const n = Number(nano) / 1e9;
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  accent,
  href,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
  href?: string;
}) {
  const inner = (
    <Card className={`border-white/10 bg-white/5 transition-all ${href ? "cursor-pointer hover:border-white/20" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className={`text-2xl font-bold font-display truncate ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Icon className={`w-5 h-5 ${accent ?? "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = () =>
    JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to load stats");
      setStats(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold">📊 Дашборд</h1>
            <p className="text-muted-foreground text-sm mt-1">Общая статистика платформы</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStats} className="gap-2 border-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && !stats ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <>
            <div className="mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">💰 Финансы</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title="Общий баланс системы"
                  value={`${nanoToTon(stats.totalBalanceNano)} TON`}
                  sub="Сумма всех кошельков"
                  icon={Wallet}
                  accent="text-emerald-400"
                />
                <StatCard
                  title="Заблокировано в эскроу"
                  value={`${nanoToTon(stats.escrowLockedNano)} TON`}
                  sub="Активные / спорные заказы"
                  icon={Lock}
                  accent="text-amber-400"
                />
                <StatCard
                  title="Доход платформы (комиссии)"
                  value={`${nanoToTon(stats.platformFeeRevenueNano)} TON`}
                  sub="Сборы со всех сделок"
                  icon={BarChart3}
                  accent="text-blue-400"
                />
              </div>
            </div>

            <div className="mb-3 mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">⚡ Требуют внимания</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Пополнения"
                  value={stats.pendingPayments}
                  sub="На рассмотрении"
                  icon={CreditCard}
                  accent={stats.pendingPayments > 0 ? "text-orange-400" : undefined}
                  href="/admin/payments"
                />
                <StatCard
                  title="Выплаты"
                  value={stats.pendingWithdrawals}
                  sub="Ожидают одобрения"
                  icon={ArrowUpFromLine}
                  accent={stats.pendingWithdrawals > 0 ? "text-orange-400" : undefined}
                  href="/admin/withdrawals"
                />
                <StatCard
                  title="Открытые споры"
                  value={stats.openDisputes}
                  sub={`Из ${stats.totalDisputes} всего`}
                  icon={Gavel}
                  accent={stats.openDisputes > 0 ? "text-red-400" : undefined}
                  href="/admin/disputes"
                />
                <StatCard
                  title="Отзывы на проверке"
                  value={stats.pendingReviews}
                  sub="Ожидают модерации"
                  icon={Star}
                  accent={stats.pendingReviews > 0 ? "text-yellow-400" : undefined}
                />
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">📈 Платформа</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Пользователей"
                  value={stats.totalUsers.toLocaleString("ru-RU")}
                  sub={`${stats.totalFreelancers} фрилансеров`}
                  icon={Users}
                  href="/admin/users"
                />
                <StatCard
                  title="Заказов всего"
                  value={stats.totalOrders.toLocaleString("ru-RU")}
                  sub={`${stats.activeOrders} активных`}
                  icon={ClipboardList}
                />
                <StatCard
                  title="Активных гигов"
                  value={stats.totalGigs.toLocaleString("ru-RU")}
                  sub={`${stats.pendingGigs} на проверке`}
                  icon={ShoppingBag}
                />
                <StatCard
                  title="Споров всего"
                  value={stats.totalDisputes.toLocaleString("ru-RU")}
                  sub={`${stats.openDisputes} открытых`}
                  icon={Gavel}
                  href="/admin/disputes"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
