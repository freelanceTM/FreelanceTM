import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, CheckCircle, XCircle, RefreshCw, Loader2,
  ImageIcon, ArrowUpFromLine, Phone,
} from "lucide-react";
import { useState, useEffect } from "react";

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

type Section = "topups" | "payouts";
type Filter = "pending" | "approved" | "rejected" | "all";

export default function AdminPayments() {
  const { toast } = useToast();
  const [section, setSection] = useState<Section>("topups");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [topups, setTopups] = useState<AdminTopupRow[]>([]);
  const [loadingTopups, setLoadingTopups] = useState(true);
  const [topupFilter, setTopupFilter] = useState<Filter>("pending");

  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [payoutFilter, setPayoutFilter] = useState<Filter>("pending");

  const getToken = () => JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  const fetchTopups = async () => {
    setLoadingTopups(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/topups?status=${topupFilter}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setTopups((await res.json()).items ?? []);
    } catch {}
    setLoadingTopups(false);
  };

  const fetchPayouts = async () => {
    setLoadingPayouts(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/payouts?status=${payoutFilter}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setPayouts((await res.json()).items ?? []);
    } catch {}
    setLoadingPayouts(false);
  };

  useEffect(() => { fetchTopups(); fetchPayouts(); }, []);
  useEffect(() => { fetchTopups(); }, [topupFilter]);
  useEffect(() => { fetchPayouts(); }, [payoutFilter]);

  const handleTopupAction = async (id: number, action: "approve" | "reject") => {
    setProcessingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/topup/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      toast({ title: action === "approve" ? "Пополнение одобрено ✓" : "Пополнение отклонено" });
      fetchTopups();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setProcessingId(null); }
  };

  const handlePayoutAction = async (id: number, action: "approve" | "reject") => {
    setProcessingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/payout/${id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
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

  const filterBtns = (current: Filter, set: (v: Filter) => void) => (
    <div className="flex gap-2 mb-6 flex-wrap">
      {(["pending", "approved", "rejected", "all"] as const).map((s) => (
        <button key={s} onClick={() => set(s)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
            current === s
              ? "bg-primary/20 border-primary text-primary"
              : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
          }`}>
          {s === "pending" ? "На проверке" : s === "approved" ? "Одобрены" : s === "rejected" ? "Отклонены" : "Все"}
        </button>
      ))}
    </div>
  );

  return (
    <AdminLayout>
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Скриншот" className="w-full rounded-xl border border-white/10 shadow-2xl" />
            <button onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-background border border-white/20 flex items-center justify-center text-sm hover:bg-white/10">✕</button>
          </div>
        </div>
      )}

      <div className="p-8">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">💰 Пополнения</h1>
            <p className="text-muted-foreground text-sm mt-1">Управление пополнениями и выводами</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchTopups(); fetchPayouts(); }} className="gap-2 border-white/10">
            <RefreshCw className="w-4 h-4" />Обновить
          </Button>
        </div>

        <div className="flex gap-2 mb-8 flex-wrap">
          {([
            { key: "topups", label: "Пополнения", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
            { key: "payouts", label: "Выводы", icon: <ArrowUpFromLine className="w-3.5 h-3.5" /> },
          ] as const).map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                section === s.key ? "bg-primary/20 border-primary text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
              }`}>
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {section === "topups" && (
          <>
            {filterBtns(topupFilter, setTopupFilter)}
            {loadingTopups ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : topups.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground"><ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-20" /><p>Нет заявок</p></div>
            ) : (
              <div className="space-y-4">
                {topups.map((t) => (
                  <Card key={t.id} className="border-white/10 bg-white/5">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="w-full sm:w-24 h-24 rounded-lg border border-white/10 bg-white/5 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                          onClick={() => t.screenshotUrl && setPreviewUrl(t.screenshotUrl)}>
                          {t.screenshotUrl ? <img src={t.screenshotUrl} alt="screenshot" className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-muted-foreground/30" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xl font-display font-bold text-primary">+{t.amount.toLocaleString("ru-RU")} TMT</span>
                                {ocrBadge(t.ocrStatus)}
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                <span className="font-medium text-foreground">{t.displayName || t.username}</span>{" · @"}{t.username}{" · "}<span className="text-xs">{t.email}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Баланс: <span className="text-foreground">{(t.userBalance ?? 0).toLocaleString("ru-RU")} TMT</span>{" · "}
                                {new Date(t.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                            {t.adminStatus === "pending" ? (
                              <div className="flex items-center gap-2">
                                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" disabled={processingId === t.id} onClick={() => handleTopupAction(t.id, "approve")}>
                                  {processingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}Подтвердить
                                </Button>
                                <Button size="sm" variant="destructive" className="gap-1.5" disabled={processingId === t.id} onClick={() => handleTopupAction(t.id, "reject")}>
                                  {processingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}Отклонить
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

        {section === "payouts" && (
          <>
            {filterBtns(payoutFilter, setPayoutFilter)}
            {loadingPayouts ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : payouts.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground"><ArrowUpFromLine className="w-12 h-12 mx-auto mb-4 opacity-20" /><p>Нет заявок на вывод</p></div>
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
                          <div className="flex items-center gap-2 text-sm text-primary font-mono mb-1"><Phone className="w-3.5 h-3.5" />{p.phoneNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{p.displayName || p.username}</span>{" · @"}{p.username}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Баланс: <span className="text-foreground">{(p.userBalance ?? 0).toLocaleString("ru-RU")} TMT</span>{" · "}
                            {new Date(p.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        {p.status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" disabled={processingId === p.id} onClick={() => handlePayoutAction(p.id, "approve")}>
                              {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}Выплатить
                            </Button>
                            <Button size="sm" variant="destructive" className="gap-1.5" disabled={processingId === p.id} onClick={() => handlePayoutAction(p.id, "reject")}>
                              {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}Отклонить
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
      </div>
    </AdminLayout>
  );
}
