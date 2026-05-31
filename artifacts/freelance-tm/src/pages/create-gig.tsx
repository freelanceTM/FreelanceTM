import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useCreateGig, useListCategories } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Eye, EyeOff, Sparkles, Info } from "lucide-react";

async function aiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export default function CreateGig() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: categories } = useListCategories();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [revisions, setRevisions] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState<"active" | "draft">("active");

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [priceHint, setPriceHint] = useState<{ min: number; max: number; recommended: number } | null>(null);
  const [moderating, setModerating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role === "client")) {
      toast({ title: "Только фрилансеры могут создавать услуги", variant: "destructive" });
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, user, setLocation, toast]);

  // Fetch price suggestion whenever category changes
  useEffect(() => {
    if (!categoryId || !categories) return;
    const cat = categories.find((c) => c.id.toString() === categoryId);
    if (!cat) return;
    setPriceHint(null);
    aiPost<{ min: number; max: number; recommended: number }>("/api/ai/suggest-price", {
      category: cat.name,
      level: (user as Record<string, unknown>)?.level ?? "new",
    })
      .then((data) => setPriceHint(data))
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
        { category: cat?.name, title, description, type: "gig" }
      );
      setTitle(data.title);
      setDescription(data.description);
      setTagsStr(data.tags.join(", "));
      toast({ title: "✨ AI заполнил поля — проверьте и отредактируйте" });
    } catch {
      toast({ title: "AI недоступен, попробуйте позже", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const createGig = useCreateGig({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Услуга создана!" });
        setLocation(`/gigs/${data.id}`);
      },
      onError: () => {
        toast({ title: "Не удалось создать услугу", variant: "destructive" });
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !price || !deliveryDays || !categoryId) {
      toast({ title: "Заполните все обязательные поля", variant: "destructive" });
      return;
    }

    // Moderation check
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
      // If moderation fails, proceed (fail-open)
    } finally {
      setModerating(false);
    }

    createGig.mutate({
      data: {
        title,
        description,
        price: Number(price),
        deliveryDays: Number(deliveryDays),
        revisions: Number(revisions),
        categoryId: Number(categoryId),
        tags: tagsStr ? tagsStr.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        imageUrl: imageUrl || undefined,
        status,
      },
    });
  };

  const isSubmitting = moderating || createGig.isPending;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-2xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">Создать услугу</h1>
            <p className="text-muted-foreground">Опишите свои навыки и предложите их рынку Туркменистана</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary mt-1"
            onClick={handleAiFill}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            AI Заполнить
          </Button>
        </div>

        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Название услуги *</Label>
                <Input
                  id="title"
                  placeholder="Разработаю Telegram бота для вашего бизнеса"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-background/50 border-white/10"
                  minLength={10}
                  required
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Минимум 10 символов, начинайте с глагола</span>
                  <span className={title.length >= 10 ? "text-green-400" : ""}>{title.length}/80</span>
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
                  <Label htmlFor="price">Цена (USD) *</Label>
                  <Input
                    id="price"
                    type="number"
                    min={1}
                    placeholder="50"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="bg-background/50 border-white/10"
                    required
                  />
                  {priceHint && (
                    <div className="flex items-center gap-1.5 text-xs text-primary/80">
                      <Info className="w-3 h-3 shrink-0" />
                      <span>
                        Рекомендованная цена: <strong>${priceHint.recommended}</strong>
                        <span className="text-muted-foreground"> (диапазон ${priceHint.min}–${priceHint.max})</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="deliveryDays">Срок выполнения (дней) *</Label>
                  <Input
                    id="deliveryDays"
                    type="number"
                    min={1}
                    max={30}
                    placeholder="3"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(e.target.value)}
                    className="bg-background/50 border-white/10"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revisions">Количество правок</Label>
                  <Select value={revisions} onValueChange={setRevisions}>
                    <SelectTrigger className="bg-background/50 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-white/10">
                      <SelectItem value="0">Без правок</SelectItem>
                      <SelectItem value="1">1 правка</SelectItem>
                      <SelectItem value="2">2 правки</SelectItem>
                      <SelectItem value="3">3 правки</SelectItem>
                      <SelectItem value="5">5 правок</SelectItem>
                      <SelectItem value="99">Безлимитные правки</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Подробное описание *</Label>
                <Textarea
                  id="description"
                  placeholder="Опишите что вы сделаете, что нужно от заказчика, почему стоит выбрать именно вас. Чем детальнее — тем больше заказов."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[180px] bg-background/50 border-white/10"
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
                  <Label htmlFor="tags">Теги (через запятую)</Label>
                  <Input
                    id="tags"
                    placeholder="telegram, бот, python"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    className="bg-background/50 border-white/10"
                  />
                  {tagsStr && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {tagsStr.split(",").map(s => s.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Фото обложки (URL)</Label>
                  <Input
                    id="imageUrl"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="bg-background/50 border-white/10"
                  />
                </div>
              </div>

              {/* Status toggle */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Публикация</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {status === "active" ? "Услуга будет сразу видна в каталоге" : "Сохранить как черновик — не будет видна клиентам"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={status === "draft" ? "outline" : "ghost"}
                      className={`gap-1.5 border-white/10 ${status === "draft" ? "bg-white/10" : "text-muted-foreground"}`}
                      onClick={() => setStatus("draft")}
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Черновик
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={status === "active" ? "default" : "ghost"}
                      className={`gap-1.5 ${status !== "active" ? "text-muted-foreground" : ""}`}
                      onClick={() => setStatus("active")}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Опубликовать
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {moderating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {createGig.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {moderating ? "Проверка контента..." : createGig.isPending ? "Публикуем..." : status === "draft" ? "Сохранить черновик" : "Опубликовать услугу"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
