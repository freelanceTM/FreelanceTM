import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users, RefreshCw, Loader2, Search, ShieldAlert,
  ShieldCheck, CheckCircle,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface UserRow {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  isBanned: boolean;
  banReason: string | null;
  isVerified: boolean;
  kycStatus: string;
  createdAt: string;
  completedOrders: number;
  walletBalanceNano: string;
}

function roleBadge(role: string) {
  if (role === "admin") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Админ</Badge>;
  if (role === "freelancer") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Фрилансер</Badge>;
  if (role === "both") return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">Оба</Badge>;
  return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-[10px]">Клиент</Badge>;
}

function nanoToTon(nano: string): string {
  if (!nano) return "0";
  return (Number(nano) / 1e9).toFixed(4);
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getToken = () => JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  const fetchUsers = async (q = search, p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (q) params.set("search", q);
      const res = await fetch(`${API_BASE}/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data ?? []);
        setTotal(json.meta?.total ?? 0);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [page]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      fetchUsers(value, 1);
    }, 400);
  };

  const handleBanToggle = async (userId: number, currentlyBanned: boolean) => {
    setProcessingId(userId);
    const action = currentlyBanned ? "unban" : "ban";
    const body = !currentlyBanned ? JSON.stringify({ reason: "Нарушение правил платформы" }) : undefined;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Ошибка");
      toast({
        title: currentlyBanned
          ? `✅ Пользователь разблокирован`
          : `🚫 Пользователь заблокирован`,
      });
      fetchUsers();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold">👥 Пользователи</h1>
            <p className="text-muted-foreground text-sm mt-1">
              CRM — управление пользователями · {total.toLocaleString("ru-RU")} всего
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchUsers()} className="gap-2 border-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск по имени пользователя..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Пользователи не найдены</p>
          </div>
        ) : (
          <>
            {/* Table header — desktop */}
            <div className="hidden md:grid grid-cols-[40px_1fr_100px_120px_140px_100px] gap-4 px-4 py-2 text-xs text-muted-foreground font-medium mb-2">
              <div>ID</div>
              <div>Пользователь</div>
              <div>Роль</div>
              <div>Баланс</div>
              <div>Заказов / Статус</div>
              <div>Действие</div>
            </div>

            <div className="space-y-2">
              {users.map((u) => (
                <Card key={u.id} className={`border-white/10 transition-colors ${u.isBanned ? "border-red-500/20 bg-red-500/5" : "bg-white/5"}`}>
                  <CardContent className="p-4">
                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-[40px_1fr_100px_120px_140px_100px] gap-4 items-center">
                      <div className="text-xs text-muted-foreground font-mono">#{u.id}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{u.displayName || u.username}</span>
                          {u.isVerified && <CheckCircle className="w-3 h-3 text-primary shrink-0" />}
                        </div>
                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                      </div>
                      <div>{roleBadge(u.role)}</div>
                      <div className="font-mono text-sm text-foreground">{nanoToTon(u.walletBalanceNano)} TON</div>
                      <div>
                        <div className="text-sm">{u.completedOrders} завершён.</div>
                        <div className="mt-0.5">
                          {u.isBanned ? (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                              <ShieldAlert className="w-3 h-3 mr-1" />Заблокирован
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
                              <ShieldCheck className="w-3 h-3 mr-1" />Активен
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={() => handleBanToggle(u.id, u.isBanned)}
                          disabled={processingId === u.id || u.role === "admin"}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
                            u.isBanned ? "bg-red-500/40" : "bg-primary/60"
                          }`}
                          title={u.isBanned ? "Разблокировать" : "Заблокировать"}
                        >
                          {processingId === u.id ? (
                            <Loader2 className="w-3 h-3 animate-spin mx-auto text-white" />
                          ) : (
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${u.isBanned ? "translate-x-1" : "translate-x-6"}`} />
                          )}
                        </button>
                        <div className="text-[10px] text-muted-foreground mt-0.5 text-center">
                          {u.isBanned ? "Разбан" : "Бан"}
                        </div>
                      </div>
                    </div>

                    {/* Mobile layout */}
                    <div className="md:hidden">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{u.displayName || u.username}</span>
                            {u.isVerified && <CheckCircle className="w-3 h-3 text-primary" />}
                          </div>
                          <div className="text-xs text-muted-foreground">@{u.username} · ID #{u.id}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {roleBadge(u.role)}
                          {u.isBanned ? (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Бан</Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Активен</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {nanoToTon(u.walletBalanceNano)} TON · {u.completedOrders} заказов
                        </div>
                        <Button
                          size="sm"
                          variant={u.isBanned ? "outline" : "destructive"}
                          className={`text-xs h-7 ${u.isBanned ? "border-white/10" : ""}`}
                          disabled={processingId === u.id || u.role === "admin"}
                          onClick={() => handleBanToggle(u.id, u.isBanned)}
                        >
                          {processingId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          {u.isBanned ? "Разблокировать" : "Заблокировать"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ←
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
