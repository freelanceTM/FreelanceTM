import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Smartphone, Upload, Loader2, Wallet as WalletIcon,
  RefreshCw, CheckCircle, Clock, ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface TopupRequest {
  id: number;
  amount: number;
  screenshotUrl: string | null;
  ocrStatus: "pending" | "verified" | "failed";
  adminStatus: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface PayoutRequest {
  id: number;
  amount: number;
  phoneNumber: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

function topupStatusBadge(s: string) {
  if (s === "approved") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Зачислено</Badge>;
  if (s === "rejected") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Отклонено</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">На проверке</Badge>;
}

function payoutStatusBadge(s: string) {
  if (s === "approved") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Выплачено</Badge>;
  if (s === "rejected") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Отклонено — возврат</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">На проверке</Badge>;
}

type Tab = "topup" | "payout";

export default function WalletPage() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("topup");

  // Top-up state
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [topups, setTopups] = useState<TopupRequest[]>([]);
  const [loadingTopups, setLoadingTopups] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Payout state
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutPhone, setPayoutPhone] = useState("");
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const getToken = () => JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  const fetchTopups = async () => {
    const tok = getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${API_BASE}/api/wallet/topups`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setTopups((await res.json()).items ?? []);
    } catch {}
    setLoadingTopups(false);
  };

  const fetchPayouts = async () => {
    const tok = getToken();
    if (!tok) return;
    try {
      const res = await fetch(`${API_BASE}/api/wallet/payouts`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setPayouts((await res.json()).items ?? []);
    } catch {}
    setLoadingPayouts(false);
  };

  useEffect(() => { fetchTopups(); fetchPayouts(); }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  // ── Top-up submit ──
  const handleTopupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast({ title: "Введите корректную сумму", variant: "destructive" }); return; }
    const tok = getToken();
    if (!tok) { toast({ title: "Сначала авторизуйтесь", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      let screenshotPayload: { data: string; name: string } | undefined;
      if (file) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        screenshotPayload = { data: base64, name: file.name };
      }

      const res = await fetch(`${API_BASE}/api/wallet/topup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: num, screenshot: screenshotPayload }),
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Ошибка отправки");

      toast({ title: "Заявка отправлена!", description: "Средства заморожены — администратор подтвердит платёж." });
      setAmount(""); setFile(null); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchTopups();
      refreshUser();
    } catch (err: any) {
      toast({ title: err.message || "Ошибка", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Payout submit ──
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(payoutAmount);
    if (!num || num <= 0) { toast({ title: "Введите корректную сумму", variant: "destructive" }); return; }
    if (!payoutPhone.trim()) { toast({ title: "Введите номер телефона", variant: "destructive" }); return; }
    const tok = getToken();
    if (!tok) { toast({ title: "Сначала авторизуйтесь", variant: "destructive" }); return; }

    setPayoutSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/wallet/payout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: num, phoneNumber: payoutPhone.trim() }),
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Ошибка вывода");

      toast({ title: "Заявка на вывод создана!", description: "Средства заморожены — ожидайте перевода на указанный номер." });
      setPayoutAmount(""); setPayoutPhone("");
      fetchPayouts();
      refreshUser();
    } catch (err: any) {
      toast({ title: err.message || "Ошибка", variant: "destructive" });
    } finally {
      setPayoutSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return <Layout><div className="container mx-auto p-20 text-center text-muted-foreground">Загрузка...</div></Layout>;
  }

  const spendableBalance = (user as any).balance ?? 0;
  const pendingBalance = (user as any).pendingBalance ?? 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-bold mb-2 flex items-center gap-3">
            <WalletIcon className="w-7 h-7 text-primary" />
            Кошелёк
          </h1>
          <p className="text-muted-foreground text-sm">Пополнение и вывод через TM CELL</p>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-white/10">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Доступный баланс</p>
              <div className="text-3xl font-display font-bold text-primary">
                {spendableBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                <span className="text-base font-normal text-muted-foreground ml-1">TMT</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Можно тратить и выводить</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium flex items-center gap-1">
                <Clock className="w-3 h-3 text-yellow-400" />
                Ожидает проверки
              </p>
              <div className="text-3xl font-display font-bold text-yellow-400">
                {pendingBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                <span className="text-base font-normal text-muted-foreground ml-1">TMT</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Заморожено — ожидает одобрения</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("topup")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
              tab === "topup"
                ? "bg-primary/20 border-primary text-primary"
                : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Пополнение
          </button>
          <button
            onClick={() => setTab("payout")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
              tab === "payout"
                ? "bg-primary/20 border-primary text-primary"
                : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
            }`}
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            Вывод средств
          </button>
        </div>

        {/* ── TOP-UP TAB ── */}
        {tab === "topup" && (
          <>
            <Card className="mb-8 border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="w-5 h-5 text-green-400" />
                  Пополнение через TM CELL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-3 mb-4 rounded-lg bg-white/5 border border-white/10 text-sm space-y-1">
                  <p className="font-medium text-foreground">Инструкция:</p>
                  <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1">
                    <li>Переведите нужную сумму (TMT) на номер: <span className="font-mono text-primary">+993 6X XX XX XX</span></li>
                    <li>Сделайте скриншот подтверждения перевода</li>
                    <li>Введите сумму и прикрепите скриншот ниже</li>
                    <li>Средства появятся в «Ожидает проверки» — после подтверждения перейдут в «Доступный баланс»</li>
                  </ol>
                </div>

                <form onSubmit={handleTopupSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Сумма перевода (TMT)</Label>
                    <Input
                      id="amount" type="number" min="1" step="0.01"
                      placeholder="Например: 500"
                      value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="bg-background/50 border-white/10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Скриншот платежа</Label>
                    <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors overflow-hidden">
                      {preview ? (
                        <img src={preview} alt="preview" className="w-full max-h-48 object-contain p-2" />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">Нажмите для загрузки</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, GIF до 10MB</p>
                        </div>
                      )}
                      <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                    {file && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-400" /> {file.name}
                        <button type="button" className="ml-2 text-red-400 hover:underline text-xs"
                          onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>
                          Удалить
                        </button>
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full gap-2" disabled={submitting}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                    {submitting ? "Отправка..." : "Отправить на проверку"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">История пополнений</CardTitle>
                <Button variant="ghost" size="icon" onClick={fetchTopups} className="h-8 w-8">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {loadingTopups ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>
                ) : topups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Пополнений пока нет</div>
                ) : (
                  <div className="space-y-3">
                    {topups.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                            <ArrowDownToLine className="w-4 h-4 text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">+{t.amount.toLocaleString("ru-RU")} TMT</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {topupStatusBadge(t.adminStatus)}
                          {t.screenshotUrl && (
                            <a href={t.screenshotUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary/70 hover:text-primary underline">скриншот</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── PAYOUT TAB ── */}
        {tab === "payout" && (
          <>
            <Card className="mb-8 border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowUpFromLine className="w-5 h-5 text-blue-400" />
                  Вывод средств через TM CELL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-3 mb-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
                  <p className="font-medium text-blue-200">Как работает вывод:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Укажите сумму и номер телефона (TM CELL) для получения</li>
                    <li>Средства сразу списываются с вашего баланса и замораживаются</li>
                    <li>Администратор выполнит перевод и подтвердит заявку</li>
                    <li>Если заявка отклонена — средства автоматически вернутся</li>
                  </ol>
                </div>

                <form onSubmit={handlePayoutSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="payout-amount">Сумма вывода (TMT)</Label>
                    <Input
                      id="payout-amount" type="number" min="1" step="0.01"
                      placeholder="Например: 200"
                      value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)}
                      className="bg-background/50 border-white/10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Доступно: <span className="text-foreground font-medium">{spendableBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} TMT</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payout-phone">Номер телефона (+993...)</Label>
                    <Input
                      id="payout-phone" type="tel"
                      placeholder="+993 6X XX XX XX"
                      value={payoutPhone} onChange={(e) => setPayoutPhone(e.target.value)}
                      className="bg-background/50 border-white/10 font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Только мобильные переводы. Банковские карты не поддерживаются.</p>
                  </div>

                  <Button type="submit" className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white" disabled={payoutSubmitting}>
                    {payoutSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
                    {payoutSubmitting ? "Обработка..." : "Запросить вывод"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">История выводов</CardTitle>
                <Button variant="ghost" size="icon" onClick={fetchPayouts} className="h-8 w-8">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {loadingPayouts ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>
                ) : payouts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Заявок на вывод пока нет</div>
                ) : (
                  <div className="space-y-3">
                    {payouts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                            <ArrowUpFromLine className="w-4 h-4 text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">−{p.amount.toLocaleString("ru-RU")} TMT</p>
                            <p className="text-xs text-muted-foreground font-mono">{p.phoneNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                        <div>{payoutStatusBadge(p.status)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
