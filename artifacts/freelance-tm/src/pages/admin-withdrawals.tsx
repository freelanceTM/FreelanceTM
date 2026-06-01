import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowUpFromLine, CheckCircle, XCircle, RefreshCw,
  Loader2, Wallet, ExternalLink,
} from "lucide-react";
import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface WithdrawalRow {
  id: number;
  userId: number;
  amountNano: string;
  currency: string;
  destination: string;
  destinationType: string;
  status: "pending" | "processing" | "completed" | "rejected";
  note: string | null;
  createdAt: string;
  user: {
    id: number;
    username: string;
    displayName: string | null;
    walletBalanceNano: string;
  };
}

type Filter = "pending" | "processing" | "completed" | "rejected" | "all";

function nanoToTon(nano: string): string {
  if (!nano) return "0";
  return (Number(nano) / 1e9).toFixed(4);
}

function statusBadge(s: string) {
  if (s === "completed") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Одобрено</Badge>;
  if (s === "rejected") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Отклонено</Badge>;
  if (s === "processing") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">В обработке</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">На проверке</Badge>;
}

export default function AdminWithdrawals() {
  const { toast } = useToast();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const getToken = () => JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`${API_BASE}/api/admin/withdrawals${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const json = await res.json();
        setWithdrawals(json.data ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchWithdrawals(); }, [filter]);

  const handleAction = async (id: number, action: "approve" | "reject") => {
    setProcessingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error((await res.json()).message || "Ошибка");
      toast({
        title: action === "approve"
          ? "✅ Вывод одобрен — средства списаны с кошелька"
          : "❌ Вывод отклонён — средства возвращены пользователю",
        variant: action === "approve" ? "default" : "destructive",
      });
      fetchWithdrawals();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const filterLabels: Record<Filter, string> = {
    pending: "На проверке",
    processing: "В обработке",
    completed: "Выплачены",
    rejected: "Отклонены",
    all: "Все",
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold">💳 Выплаты</h1>
            <p className="text-muted-foreground text-sm mt-1">Заявки на вывод средств</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchWithdrawals} className="gap-2 border-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["pending", "processing", "completed", "rejected", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === f ? "bg-primary/20 border-primary text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
              }`}>
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ArrowUpFromLine className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Нет заявок в этой категории</p>
          </div>
        ) : (
          <div className="space-y-4">
            {withdrawals.map((w) => (
              <Card key={w.id} className="border-white/10 bg-white/5">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-xl font-display font-bold text-blue-400">
                          −{nanoToTon(w.amountNano)} TON
                        </span>
                        {statusBadge(w.status)}
                        <span className="text-xs text-muted-foreground font-mono">ID #{w.id}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-mono text-primary/80 mb-1 break-all">
                        <Wallet className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{w.destination}</span>
                        {w.destination && (
                          <a href={`https://tonviewer.com/${w.destination}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-primary" />
                          </a>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {w.user.displayName || w.user.username}
                        </span>
                        {" · @"}{w.user.username}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Баланс кошелька: <span className="text-foreground font-mono">{nanoToTon(w.user.walletBalanceNano)} TON</span>
                        {" · "}
                        {new Date(w.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {w.note && (
                        <div className="text-xs text-muted-foreground mt-1 italic">Причина: {w.note}</div>
                      )}
                    </div>

                    {w.status === "pending" && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-green-600 hover:bg-green-700 text-white w-full"
                          disabled={processingId === w.id}
                          onClick={() => handleAction(w.id, "approve")}
                        >
                          {processingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Одобрить
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5 w-full"
                          disabled={processingId === w.id}
                          onClick={() => handleAction(w.id, "reject")}
                        >
                          {processingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Отклонить
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
