import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, getTelegramInitData } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useRegisterUser } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Loader2, Briefcase, ShoppingBag, Users, BadgeCheck, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type Role = "freelancer" | "client" | "both";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [telegramLoading, setTelegramLoading] = useState(false);

  const isTelegramWebApp = !!window.Telegram?.WebApp;

  useEffect(() => {
    if (!isTelegramWebApp) return;
    const initData = getTelegramInitData();
    if (!initData) return;

    setTelegramLoading(true);
    fetch(`${API_BASE}/api/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, role }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Telegram auth failed");
        const data = await res.json();
        if (data.user && data.tokens) {
          login(data.user, data.tokens);
          toast({ title: "Добро пожаловать в FreelanceTM!" });
          setLocation(data.user.onboardingCompleted ? "/dashboard" : "/onboarding");
        }
      })
      .catch(() => {
        toast({ title: "Ошибка Telegram-авторизации", variant: "destructive" });
      })
      .finally(() => setTelegramLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTelegramWebApp]);

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: (data) => {
        // The backend returns User + a `token` field for session auth
        const anyData = data as typeof data & { token?: string };
        const rawToken = anyData.token;
        const tokens = rawToken
          ? { accessToken: rawToken, refreshToken: rawToken, expiresIn: 86400 * 30 }
          : undefined;
        login(data, tokens);
        toast({ title: isLogin ? "С возвращением!" : "Добро пожаловать в FreelanceTM!" });
        if (!data.onboardingCompleted) {
          setLocation("/onboarding");
        } else {
          setLocation("/dashboard");
        }
      },
      onError: () => {
        toast({ title: t.common.error, description: "Попробуйте ещё раз.", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    registerMutation.mutate({ data: { username, email, role } });
  };

  const handleTelegramLogin = () => {
    if (!isTelegramWebApp) {
      toast({ title: "Откройте приложение через Telegram", variant: "destructive" });
      return;
    }
    const initData = getTelegramInitData();
    if (!initData) {
      toast({ title: "Не удалось получить Telegram initData", variant: "destructive" });
      return;
    }
    setTelegramLoading(true);
    fetch(`${API_BASE}/api/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, role }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Telegram auth failed");
        const data = await res.json();
        if (data.user && data.tokens) {
          login(data.user, data.tokens);
          toast({ title: "Добро пожаловать!" });
          setLocation(data.user.onboardingCompleted ? "/dashboard" : "/onboarding");
        }
      })
      .catch(() => {
        toast({ title: "Ошибка авторизации через Telegram", variant: "destructive" });
      })
      .finally(() => setTelegramLoading(false));
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
            <div className="inline-flex w-14 h-14 bg-primary rounded-2xl items-center justify-center text-primary-foreground font-display font-bold text-3xl mb-4 shadow-lg shadow-primary/30">
              F
            </div>
            <h1 className="text-3xl font-display font-bold mb-2">{t.login.title}</h1>
            <p className="text-muted-foreground">{t.login.sub}</p>
          </div>

          <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>
                {isTelegramWebApp ? "Вход через Telegram" : isLogin ? t.login.signIn : t.login.signUp}
              </CardTitle>
              <CardDescription>
                {isTelegramWebApp
                  ? "Нажмите кнопку ниже для быстрого входа"
                  : isLogin
                  ? "Введите данные для входа"
                  : "Создайте аккаунт на FreelanceTM"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isTelegramWebApp && (
                <div className="space-y-4">
                  <Button
                    onClick={handleTelegramLogin}
                    disabled={telegramLoading}
                    className="w-full h-11 gap-2 bg-[#24A1DE] hover:bg-[#1a8bc2] text-white"
                  >
                    {telegramLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                    Войти через Telegram
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Или используйте форму ниже для тестирования
                  </p>
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className={`space-y-4 ${isTelegramWebApp ? "pt-4 border-t border-white/10 mt-4" : ""}`}
              >
                <div className="space-y-2">
                  <Label htmlFor="username">{t.login.username}</Label>
                  <Input
                    id="username"
                    placeholder="e.g. turkmen_dev"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-background/50 border-white/10"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t.login.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50 border-white/10"
                    autoComplete="email"
                  />
                </div>

                {/* Role selection — always shown so every registration has an explicit role choice */}
                <div className="space-y-2">
                  <Label>{t.login.chooseRole}</Label>
                  <div className="space-y-2">
                    {(
                      [
                        { value: "client" as Role, icon: ShoppingBag, label: t.login.client },
                        { value: "freelancer" as Role, icon: Briefcase, label: t.login.freelancer },
                        { value: "both" as Role, icon: Users, label: t.login.both },
                      ] as const
                    ).map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${
                          role === value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="font-medium text-left flex-1">{label}</span>
                        {role === value && <BadgeCheck className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-4 h-11"
                  disabled={registerMutation.isPending || telegramLoading}
                >
                  {registerMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t.login.continue}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {isLogin ? `${t.login.noAccount} ` : `${t.login.haveAccount} `}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary hover:underline font-medium"
                >
                  {isLogin ? t.login.signUp : t.login.signIn}
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
}
