import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useCompleteOnboarding } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { BadgeCheck, Briefcase, ShoppingBag, Users, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

type Role = "freelancer" | "client" | "both";

export default function Onboarding() {
  const { t } = useI18n();
  const { user, login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const [role, setRole] = useState<Role>("client");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [telegram, setTelegram] = useState(user?.telegramUsername || "");
  const [skillsStr, setSkillsStr] = useState((user?.skills || []).join(", "));
  const [portfolio, setPortfolio] = useState("");

  const complete = useCompleteOnboarding({
    mutation: {
      onSuccess: (data) => {
        login(data);
        toast({ title: "Профиль заполнен! Добро пожаловать 🎉" });
        setLocation("/dashboard");
      },
      onError: () => {
        toast({ title: t.common.error, variant: "destructive" });
      }
    }
  });

  const steps = [t.onboarding.step1, t.onboarding.step2, t.onboarding.step3];

  const handleFinish = () => {
    complete.mutate({
      data: {
        role,
        displayName: displayName || undefined,
        bio: bio || undefined,
        skills: skillsStr ? skillsStr.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        telegramUsername: telegram || undefined,
        portfolioUrls: portfolio ? [portfolio] : undefined,
        languages: ["ru"],
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 bg-primary rounded-xl items-center justify-center text-primary-foreground font-display font-bold text-2xl mb-3">
            F
          </div>
          <h1 className="text-2xl font-display font-bold">{t.onboarding.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t.onboarding.sub}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 ${
                i < step ? "bg-primary text-primary-foreground" :
                i === step ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                "bg-white/10 text-muted-foreground"
              }`}>
                {i < step ? <BadgeCheck className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <div className={`w-8 h-px ${i < step ? "bg-primary" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-xl">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                <h2 className="text-xl font-display font-bold mb-2">{t.onboarding.role}</h2>
                <p className="text-muted-foreground text-sm mb-6">Это поможет нам показывать вам нужный контент</p>
                <div className="space-y-3">
                  {([
                    { value: "client" as Role, icon: ShoppingBag, label: t.login.client },
                    { value: "freelancer" as Role, icon: Briefcase, label: t.login.freelancer },
                    { value: "both" as Role, icon: Users, label: t.login.both },
                  ] as const).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      onClick={() => setRole(value)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                        role === value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">{label}</span>
                      {role === value && <BadgeCheck className="w-4 h-4 ml-auto text-primary" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-5">
                <h2 className="text-xl font-display font-bold mb-2">{t.onboarding.step2}</h2>
                <div className="space-y-2">
                  <Label>{t.onboarding.displayName}</Label>
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder={user?.username}
                    className="bg-background/50 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.onboarding.bio}</Label>
                  <Textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder={t.onboarding.bioPlaceholder}
                    className="min-h-[100px] bg-background/50 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.onboarding.telegram}</Label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 bg-white/5 border border-r-0 border-white/10 rounded-l-md text-muted-foreground text-sm">@</span>
                    <Input
                      value={telegram}
                      onChange={e => setTelegram(e.target.value)}
                      placeholder="username"
                      className="rounded-l-none bg-background/50 border-white/10"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-5">
                <h2 className="text-xl font-display font-bold mb-2">{t.onboarding.step3}</h2>
                <div className="space-y-2">
                  <Label>{t.onboarding.skills}</Label>
                  <Input
                    value={skillsStr}
                    onChange={e => setSkillsStr(e.target.value)}
                    placeholder={t.onboarding.skillsPlaceholder}
                    className="bg-background/50 border-white/10"
                  />
                  {skillsStr && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {skillsStr.split(",").map(s => s.trim()).filter(Boolean).map(skill => (
                        <span key={skill} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">{skill}</span>
                      ))}
                    </div>
                  )}
                </div>
                {(role === "freelancer" || role === "both") && (
                  <div className="space-y-2">
                    <Label>{t.onboarding.portfolio}</Label>
                    <Input
                      value={portfolio}
                      onChange={e => setPortfolio(e.target.value)}
                      placeholder={t.onboarding.portfolioPlaceholder}
                      className="bg-background/50 border-white/10"
                    />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            <div>
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep(s => s - 1)} className="gap-1 text-muted-foreground">
                  <ChevronLeft className="w-4 h-4" />
                  {t.onboarding.back}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="text-muted-foreground text-sm">
                  {t.onboarding.skip}
                </Button>
              )}
            </div>
            <div>
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep(s => s + 1)} className="gap-1">
                  {t.onboarding.next}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={complete.isPending} className="gap-2">
                  {complete.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t.onboarding.finish}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
