import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Loader2, Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function VerifyEmail() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const params = new URLSearchParams(search);
  const email = params.get("email") || "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!email) {
      setLocation("/login");
    }
  }, [email, setLocation]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const fullCode = code.join("");

  const handleDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...code];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || "";
    }
    setCode(next);
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify = async () => {
    if (fullCode.length < 6) {
      toast({ title: "Введите все 6 цифр кода", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: fullCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Ошибка подтверждения",
          description: data.error || "Неверный код",
          variant: "destructive",
        });
        return;
      }

      const tokens = data.token
        ? { accessToken: data.token, refreshToken: data.token, expiresIn: 86400 * 30 }
        : undefined;

      login(data.user, tokens);
      toast({ title: "Email подтверждён! Добро пожаловать 🎉" });
      setLocation(data.user.onboardingCompleted ? "/dashboard" : "/onboarding");
    } catch {
      toast({ title: "Ошибка сети. Попробуйте снова.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Не удалось отправить код",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Код отправлен повторно на " + email });
      setCountdown(60);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      toast({ title: "Ошибка сети. Попробуйте снова.", variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 bg-primary rounded-2xl items-center justify-center mb-4 shadow-lg shadow-primary/30">
              <Mail className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold mb-2">Подтверждение почты</h1>
            <p className="text-muted-foreground">
              Мы отправили 6-значный код на
            </p>
            <p className="text-foreground font-medium mt-1">{email}</p>
          </div>

          <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Введите код</CardTitle>
              <CardDescription>Код действителен 5 минут</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center gap-3" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold rounded-lg border border-white/20 bg-white/5 text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <Button
                onClick={handleVerify}
                disabled={loading || fullCode.length < 6}
                className="w-full h-11"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Подтвердить
              </Button>

              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResend}
                  disabled={resendLoading || countdown > 0}
                  className="text-muted-foreground hover:text-foreground gap-2"
                >
                  {resendLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {countdown > 0
                    ? `Повторно через ${countdown}с`
                    : "Отправить код повторно"}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Не получили код? Проверьте папку «Спам» или{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="text-primary hover:underline"
                >
                  вернитесь назад
                </button>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
}
