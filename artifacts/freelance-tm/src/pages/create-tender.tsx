import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useListCategories } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

async function aiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function getToken() {
  try {
    return JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";
  } catch {
    return "";
  }
}

export default function CreateTender() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: categories } = useListCategories();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [skillsStr, setSkillsStr] = useState("");

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [budgetHint, setBudgetHint] = useState<{ min: number; max: number; recommended: number } | null>(null);
  const [moderating, setModerating] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({ title: "Войдите, чтобы создать тендер", variant: "destructive" });
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation, toast]);

  useEffect(() => {
    if (!categoryId || !categories) return;
    const cat = categories.find((c) => c.id.toString() === categoryId);
    if (!cat) return;
    setBudgetHint(null);
    aiPost<{ min: number; max: number; recommended: number }>("/api/ai/suggest-price", {
      category: cat.name,
      level: (user as Record<string, unknown>)?.level ?? "new",
    })
      .then((data) => setBudgetHint(data))
      .catch(() => {});
  }, [categoryId, categories, user]);

  const handleAiFill = async () => {
    if (!categoryId || !categories) {
      toast({ title: "Сначала выберите категорию", variant: "destructive" });
      return;
    }
    const cat = categories.find((c) => c.id.toString() === categoryId);
    setAiLoading(true);
    try {
      const data = await aiPost<{ title: string; description: string; tags: string[] }>(
        "/api/ai/generate-content",
        { category: cat?.name, title, description, type: "tender" }
      );
      setTitle(data.title);
      setDescription(data.description);
      setSkillsStr(data.tags.join(", "));
      toast({ title: "✨ AI заполнил поля — проверьте и отредактируйте" });
    } catch {
      toast({ title: "AI недоступен, попробуйте позже", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const createTender = useMutation({
    mutationFn: async (body: {
      title: string;
      description: string;
      budget: number;
      categoryId: number;
      deadline?: string;
      skills?: string[];
    }) => {
      const res = await fetch("/api/tenders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Ошибка");
      }
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "Тендер опубликован!" });
      setLocation(`/tenders/${data.id}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !budget || !categoryId) {
      toast({ title: "Заполните все обязательные поля", variant: "destructive" });
      return;
    }

    setModerating(true);
    try {
      const mod = await aiPost<{ safe: boolean; reason?: string }>("/api/ai/moderate", {
        content: `${title}\n\n${description}`,
      });
      if (!mod.safe) {
        toast({
          title: "Контент нарушает правила платформы",
          description: mod.reason,
          variant: "destructive",
        });
        return;
      }
    } catch {
      // fail-open
    } finally {
      setModerating(false);
    }

    createTender.mutate({
      title,
      description,
      budget: Number(budget),
      categoryId: Number(categoryId),
      deadline: deadline || undefined,
      skills: skillsStr ? skillsStr.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });
  };

  const isSubmitting = moderating || createTender.isPending;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-2xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">Разместить тендер</h1>
            <p className="text-muted-foreground">Опишите задачу — фрилансеры пришлют предложения</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary mt-1"
            onClick={handleAiFill}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Заполнить
          </Button>
        </div>

        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">

              <div className="space-y-2">
                <Label htmlFor="title">Название задачи *</Label>
                <Input
                  id="title"
                  placeholder="Нужен Telegram-бот для записи клиентов"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-background/50 border-white/10"
                  minLength={5}
                  required
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Опишите задачу кратко и ясно</span>
                  <span className={title.length >= 5 ? "text-green-400" : ""}>{title.length}/200</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="category">Категория *</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} required>
                    <SelectTrigger className="bg-background/50 border-white/10">
                      <SelectValue placeholder="Выбрать категорию" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-white/10">
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget">Бюджет (USD) *</Label>
                  <Input
                    id="budget"
                    type="number"
                    min={1}
                    placeholder="200"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="bg-background/50 border-white/10"
                    required
                  />
                  {budgetHint && (
                    <div className="flex items-center gap-1.5 text-xs text-primary/80">
                      <Info className="w-3 h-3 shrink-0" />
                      <span>
                        Рыночный бюджет: <strong>${budgetHint.recommended}</strong>
                        <span className="text-muted-foreground"> (${budgetHint.min}–${budgetHint.max})</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Подробное описание задачи *</Label>
                <Textarea
                  id="description"
                  placeholder="Подробно опишите что нужно сделать, какой результат ожидаете, есть ли примеры. Чем детальнее — тем лучше предложения от фрилансеров."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[200px] bg-background/50 border-white/10"
                  minLength={20}
                  required
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Минимум 20 символов</span>
                  <span className={description.length >= 20 ? "text-green-400" : ""}>{description.length}</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="skills">Требуемые навыки (через запятую)</Label>
                  <Input
                    id="skills"
                    placeholder="telegram, python, бот"
                    value={skillsStr}
                    onChange={(e) => setSkillsStr(e.target.value)}
                    className="bg-background/50 border-white/10"
                  />
                  {skillsStr && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {skillsStr.split(",").map(s => s.trim()).filter(Boolean).map(skill => (
                        <span key={skill} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">#{skill}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Дедлайн (необязательно)</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="bg-background/50 border-white/10"
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                {(moderating || createTender.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {moderating ? "Проверка контента..." : createTender.isPending ? "Публикуем..." : "Опубликовать тендер"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
