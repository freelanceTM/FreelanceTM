import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Smartphone } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function TmCellTopup({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Введите сумму", variant: "destructive" });
      return;
    }

    const tokens = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    if (!tokens.accessToken) {
      toast({ title: "Авторизуйтесь", variant: "destructive" });
      return;
    }

    setLoading(true);
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
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: parseFloat(amount), screenshot: screenshotPayload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка отправки");
      }

      toast({
        title: "Заявка отправлена!",
        description: "Средства зачислены — ожидайте подтверждения администратора.",
      });
      setOpen(false);
      setAmount("");
      setFile(null);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: err.message || "Ошибка отправки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2 border-white/10 bg-white/5" onClick={() => setOpen(true)}>
        <Smartphone className="w-4 h-4 text-green-400" />
        Пополнить TM CELL
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-400" />
              Пополнение через TM CELL
            </DialogTitle>
            <DialogDescription>
              Переведите манаты на указанный номер и загрузите скриншот платежа.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm space-y-1">
            <p className="text-muted-foreground">Инструкция:</p>
            <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1">
              <li>Переведите сумму на номер: <span className="font-mono text-primary">+993 6X XX XX XX</span></li>
              <li>Сделайте скриншот чека/подтверждения</li>
              <li>Укажите сумму и прикрепите скриншот ниже</li>
              <li>Средства будут зачислены автоматически</li>
            </ol>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Сумма (TMT)</Label>
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
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">
                    {file ? file.name : "Нажмите для загрузки"}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Отправить на проверку
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
