import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, CheckCircle, XCircle, RefreshCw, Loader2, ImageIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface AdminTopupRow {
  id: number;
  amount: number;
  screenshotUrl: string | null;
  ocrStatus: "pending" | "verified" | "failed";
  adminStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  userId: number;
  username: string;
  displayName: string | null;
  email: string;
  userBalance: number;
}

function ocrBadge(s: string) {
  if (s === "verified") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">OCR OK</Badge>;
  if (s === "failed") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">OCR ✗</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">OCR…</Badge>;
}

export default function AdminPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [topups, setTopups] = useState<AdminTopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) { setLocation("/login"); return; }
      if (user && (user as any).role !== "admin") { setLocation("/"); return; }
    }
  }, [authLoading, isAuthenticated, user, setLocation]);

  const fetchTopups = async () => {
    setLoading(true);
    const tok = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    try {
      const res = await fetch(`${API_BASE}/api/admin/topups?status=${filter}`, {
        headers: { Authorization: `Bearer ${tok.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTopups(data.items ?? []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (user && (user as any).role === "admin") fetchTopups(); }, [filter, user]);

  const handleAction = async (id: number, action: "approve" | "reject") => {
    const tok = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    setProcessingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/topup/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok.accessToken}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast({
        title: action === "approve" ? "Одобрено ✓" : "Отклонено — баланс возвращён",
        variant: action === "approve" ? "default" : "destructive",
      });
      fetchTopups();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  if (authLoading || !user) {
    return <Layout><div className="container mx-auto p-20 text-center text-muted-foreground">Загрузка...</div></Layout>;
  }
  if ((user as any).role !== "admin") {
    return <Layout><div className="container mx-auto p-20 text-center text-destructive">Доступ запрещён</div></Layout>;
  }

  return (
    <Layout>
      {/* Screenshot preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Скриншот" className="w-full rounded-xl border border-white/10 shadow-2xl" />
            <button onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-background border border-white/20 flex items-center justify-center text-sm hover:bg-white/10">
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-primary" />
              Панель администратора
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Проверка и подтверждение заявок на пополнение</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTopups} className="gap-2 border-white/10">
            <RefreshCw className="w-4 h-4" />
            Обновить
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === s
                  ? "bg-primary/20 border-primary text-primary"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
              }`}>
              {s === "pending" ? "На проверке" : s === "approved" ? "Одобрены" : s === "rejected" ? "Отклонены" : "Все"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : topups.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Нет заявок в этой категории</p>
          </div>
        ) : (
          <div className="space-y-4">
            {topups.map((t) => (
              <Card key={t.id} className="border-white/10 bg-white/5">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Screenshot thumbnail */}
                    <div
                      className="w-full sm:w-24 h-24 rounded-lg border border-white/10 bg-white/5 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                      onClick={() => t.screenshotUrl && setPreviewUrl(t.screenshotUrl)}
                    >
                      {t.screenshotUrl ? (
                        <img src={t.screenshotUrl} alt="screenshot"
                          className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xl font-display font-bold text-primary">
                              +{t.amount.toLocaleString("ru-RU")} TMT
                            </span>
                            {ocrBadge(t.ocrStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            <span className="font-medium text-foreground">{t.displayName || t.username}</span>
                            {" · "}
                            <span>@{t.username}</span>
                            {" · "}
                            <span className="text-xs">{t.email}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Баланс после зачисления: <span className="text-foreground">{(t.userBalance ?? 0).toLocaleString("ru-RU")} TMT</span>
                            {" · "}
                            {new Date(t.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>

                        {t.adminStatus === "pending" ? (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                              disabled={processingId === t.id}
                              onClick={() => handleAction(t.id, "approve")}
                            >
                              {processingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Подтвердить
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              disabled={processingId === t.id}
                              onClick={() => handleAction(t.id, "reject")}
                            >
                              {processingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                              Отклонить
                            </Button>
                          </div>
                        ) : (
                          <Badge className={
                            t.adminStatus === "approved"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                          }>
                            {t.adminStatus === "approved" ? "Одобрено" : "Отклонено"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
