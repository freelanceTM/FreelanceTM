import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, CheckCircle, XCircle, RefreshCw, Loader2,
  ImageIcon, ArrowUpFromLine, Gavel, Phone,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface AdminPayoutRow {
  id: number;
  amount: number;
  phoneNumber: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  userId: number;
  username: string;
  displayName: string | null;
  email: string;
  userBalance: number;
}

interface DisputedOrderRow {
  id: number;
  price: number;
  status: string;
  isDisputed: boolean;
  createdAt: string;
  buyerId: number;
  sellerId: number;
  buyerUsername: string;
  buyerDisplayName: string | null;
  sellerUsername: string;
  sellerDisplayName: string | null;
  gigTitle: string;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function ocrBadge(s: string) {
  if (s === "verified") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">OCR OK</Badge>;
  if (s === "failed") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">OCR ✗</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">OCR…</Badge>;
}

function statusBadge(s: string) {
  if (s === "approved") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Одобрено</Badge>;
  if (s === "rejected") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Отклонено</Badge>;
  return null;
}

type Section = "topups" | "payouts" | "disputes";

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [section, setSection] = useState<Section>("topups");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Topup state
  const [topups, setTopups] = useState<AdminTopupRow[]>([]);
  const [loadingTopups, setLoadingTopups] = useState(true);
  const [topupFilter, setTopupFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  // Payout state
  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [payoutFilter, setPayoutFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  // Dispute state
  const [disputes, setDisputes] = useState<DisputedOrderRow[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) { setLocation("/login"); return; }
      if (user && (user as any).role !== "admin") { setLocation("/"); return; }
    }
  }, [authLoading, isAuthenticated, user, setLocation]);

  const getToken = () => JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  // Fetch functions
  const fetchTopups = async () => {
    setLoadingTopups(true);
    const tok = getToken();
    try {
      const res = await fetch(`${API_BASE}/api/admin/topups?status=${topupFilter}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setTopups((await res.json()).items ?? []);
    } catch {}
    setLoadingTopups(false);
  };

  const fetchPayouts = async () => {
    setLoadingPayouts(true);
    const tok = getToken();
    try {
      const res = await fetch(`${API_BASE}/api/admin/payouts?status=${payoutFilter}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setPayouts((await res.json()).items ?? []);
    } catch {}
    setLoadingPayouts(false);
  };

  const fetchDisputes = async () => {
    setLoadingDisputes(true);
    const tok = getToken();
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders/disputed`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setDisputes((await res.json()).items ?? []);
    } catch {}
    setLoadingDisputes(false);
  };

  useEffect(() => { if (user && (user as any).role === "admin") { fetchTopups(); fetchPayouts(); fetchDisputes(); } }, [user]);
  useEffect(() => { if (user && (user as any).role === "admin") fetchTopups(); }, [topupFilter]);
  useEffect(() => { if (user && (user as any).role === "admin") fetchPayouts(); }, [payoutFilter]);

  // Action handler for topups + payouts
  const handleTopupAction = async (id: number, action: "approve" | "reject") => {
    const tok = getToken();
    setProcessingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/topup/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast({ title: action === "approve" ? "Пополнение одобрено ✓" : "Пополнение отклонено" });
      fetchTopups();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setProcessingId(null); }
  };

  const handlePayoutAction = async (id: number, action: "approve" | "reject") => {
    const tok = getToken();
    setProcessingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/payout/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast({
        title: action === "approve" ? "Вывод одобрен ✓" : "Вывод отклонён — баланс возвращён",
        variant: action === "approve" ? "default" : "destructive",
      });
      fetchPayouts();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setProcessingId(null); }
  };

  const handleDisputeResolve = async (orderId: number, resolution: "refund_buyer" | "pay_seller") => {
    const tok = getToken();
    setProcessingId(orderId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast({
        title: resolution === "refund_buyer" ? "Средства возвращены покупателю" : "Средства выплачены продавцу",
      });
      fetchDisputes();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setProcessingId(null); }
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
            <p className="text-muted-foreground text-sm mt-1">Управление платежами и спорами</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchTopups(); fetchPayouts(); fetchDisputes(); }} className="gap-2 border-white/10">
            <RefreshCw className="w-4 h-4" />
            Обновить
          </Button>
        </div>

        {/* Section switcher */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {([
            { key: "topups", label: "Пополнения", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
            { key: "payouts", label: "Выводы", icon: <ArrowUpFromLine className="w-3.5 h-3.5" /> },
            { key: "disputes", label: "Активные споры", icon: <Gavel className="w-3.5 h-3.5" /> },
          ] as const).map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                section === s.key
                  ? "bg-primary/20 border-primary text-primary"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
              }`}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {/* ═══ TOPUPS SECTION ═══ */}
        {section === "topups" && (
          <>
            <div className="flex gap-2 mb-6 flex-wrap">
              {(["pending", "approved", "rejected", "all"] as const).map((s) => (
                <button key={s} onClick={() => setTopupFilter(s)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    topupFilter === s
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                  }`}>
                  {s === "pending" ? "На проверке" : s === "approved" ? "Одобрены" : s === "rejected" ? "Отклонены" : "Все"}
                </button>
              ))}
            </div>

            {loadingTopups ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
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
                        <div
                          className="w-full sm:w-24 h-24 rounded-lg border border-white/10 bg-white/5 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                          onClick={() => t.screenshotUrl && setPreviewUrl(t.screenshotUrl)}
                        >
                          {t.screenshotUrl ? (
                            <img src={t.screenshotUrl} alt="screenshot" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xl font-display font-bold text-primary">+{t.amount.toLocaleString("ru-RU")} TMT</span>
                                {ocrBadge(t.ocrStatus)}
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                <span className="font-medium text-foreground">{t.displayName || t.username}</span>{" · "}
                                <span>@{t.username}</span>{" · "}
                                <span className="text-xs">{t.email}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Баланс: <span className="text-foreground">{(t.userBalance ?? 0).toLocaleString("ru-RU")} TMT</span>{" · "}
                                {new Date(t.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                            {t.adminStatus === "pending" ? (
                              <div className="flex items-center gap-2">
                                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                  disabled={processingId === t.id} onClick={() => handleTopupAction(t.id, "approve")}>
                                  {processingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                  Подтвердить
                                </Button>
                                <Button size="sm" variant="destructive" className="gap-1.5"
                                  disabled={processingId === t.id} onClick={() => handleTopupAction(t.id, "reject")}>
                                  {processingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                  Отклонить
                                </Button>
                              </div>
                            ) : statusBadge(t.adminStatus)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ PAYOUTS SECTION ═══ */}
        {section === "payouts" && (
          <>
            <div className="flex gap-2 mb-6 flex-wrap">
              {(["pending", "approved", "rejected", "all"] as const).map((s) => (
                <button key={s} onClick={() => setPayoutFilter(s)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    payoutFilter === s
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                  }`}>
                  {s === "pending" ? "На проверке" : s === "approved" ? "Выплачены" : s === "rejected" ? "Отклонены" : "Все"}
                </button>
              ))}
            </div>

            {loadingPayouts ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <ArrowUpFromLine className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Нет заявок на вывод</p>
              </div>
            ) : (
              <div className="space-y-4">
                {payouts.map((p) => (
                  <Card key={p.id} className="border-white/10 bg-white/5">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl font-display font-bold text-blue-400">−{p.amount.toLocaleString("ru-RU")} TMT</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-primary font-mono mb-1">
                            <Phone className="w-3.5 h-3.5" />
                            {p.phoneNumber}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{p.displayName || p.username}</span>{" · "}
                            <span>@{p.username}</span>{" · "}
                            <span className="text-xs">{p.email}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Баланс: <span className="text-foreground">{(p.userBalance ?? 0).toLocaleString("ru-RU")} TMT</span>{" · "}
                            {new Date(p.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        {p.status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                              disabled={processingId === p.id} onClick={() => handlePayoutAction(p.id, "approve")}>
                              {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Выплатить
                            </Button>
                            <Button size="sm" variant="destructive" className="gap-1.5"
                              disabled={processingId === p.id} onClick={() => handlePayoutAction(p.id, "reject")}>
                              {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                              Отклонить
                            </Button>
                          </div>
                        ) : statusBadge(p.status)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ DISPUTES SECTION ═══ */}
        {section === "disputes" && (
          <>
            {loadingDisputes ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : disputes.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Gavel className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Активных споров нет</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map((d) => (
                  <Card key={d.id} className="border-orange-500/30 bg-orange-500/5">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-lg font-display font-bold text-orange-400">{d.price.toLocaleString("ru-RU")} TMT</span>
                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">Спор</Badge>
                            <span className="text-xs text-muted-foreground font-mono">Заказ #{d.id}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground mb-1 truncate">{d.gigTitle}</p>
                          <div className="text-sm text-muted-foreground space-y-0.5">
                            <div>
                              Покупатель: <span className="text-foreground font-medium">{d.buyerDisplayName || d.buyerUsername}</span>
                              {" "}(@{d.buyerUsername})
                            </div>
                            <div>
                              Продавец: <span className="text-foreground font-medium">{d.sellerDisplayName || d.sellerUsername}</span>
                              {" "}(@{d.sellerUsername})
                            </div>
                            <div className="text-xs">
                              {new Date(d.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button
                            size="sm"
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white w-full"
                            disabled={processingId === d.id}
                            onClick={() => handleDisputeResolve(d.id, "refund_buyer")}
                          >
                            {processingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                            Вернуть покупателю
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white w-full"
                            disabled={processingId === d.id}
                            onClick={() => handleDisputeResolve(d.id, "pay_seller")}
                          >
                            {processingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Выплатить продавцу
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
