import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Smartphone, Upload, Loader2, Wallet as WalletIcon, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
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

function statusBadge(adminStatus: string) {
  if (adminStatus === "approved") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Одобрено</Badge>;
  if (adminStatus === "rejected") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Отклонено</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">На проверке</Badge>;
}

export default function WalletPage() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [topups, setTopups] = useState<TopupRequest[]>([]);
  const [loadingTopups, setLoadingTopups] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const fetchTopups = async () => {
    const tok = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    if (!tok.accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/wallet/topups`, {
        headers: { Authorization: `Bearer ${tok.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTopups(data.items ?? []);
      }
    } catch {}
    setLoadingTopups(false);
  };

  useEffect(() => { fetchTopups(); }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      toast({ title: "Введите корректную сумму", variant: "destructive" });
      return;
    }

    const tok = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    if (!tok.accessToken) {
      toast({ title: "Сначала авторизуйтесь", variant: "destructive" });
      return;
    }

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
        headers: {
          Authorization: `Bearer ${tok.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: num, screenshot: screenshotPayload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка отправки");
      }

      toast({
        title: "Заявка отправлена!",
        description: "Средства заморожены на проверку — администратор подтвердит платёж.",
      });
      setAmount("");
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchTopups();
      refreshUser();
    } catch (err: any) {
      toast({ title: err.message || "Ошибка", variant: "destructive" });
    } finally {
      setSubmitting(false);
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
          <p className="text-muted-foreground text-sm">Пополняйте баланс через TM CELL</p>
        </div>

        {/* Balance cards — two distinct metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Available (spendable) balance */}
          <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-white/10">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">Доступный баланс</p>
              <div className="text-3xl font-display font-bold text-primary">
                {spendableBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                <span className="text-base font-normal text-muted-foreground ml-1">TMT</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Можно тратить прямо сейчас</p>
            </CardContent>
          </Card>

          {/* Pending (frozen) balance */}
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

        {/* Top-up form */}
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
                <li>Средства появятся в «Ожидает проверки» — после подтверждения администратором перейдут в «Доступный баланс»</li>
              </ol>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Сумма перевода (TMT)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Например: 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
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

        {/* Topup history */}
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
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">+{t.amount.toLocaleString("ru-RU")} TMT</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {statusBadge(t.adminStatus)}
                      {t.screenshotUrl && (
                        <a href={t.screenshotUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary/70 hover:text-primary underline">
                          скриншот
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
