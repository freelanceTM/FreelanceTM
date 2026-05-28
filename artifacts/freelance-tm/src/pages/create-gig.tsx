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
import { Loader2, Eye, EyeOff } from "lucide-react";

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

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role === "client")) {
      toast({ title: "Только фрилансеры могут создавать услуги", variant: "destructive" });
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, user, setLocation, toast]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !price || !deliveryDays || !categoryId) {
      toast({ title: "Заполните все обязательные поля", variant: "destructive" });
      return;
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

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">Создать услугу</h1>
          <p className="text-muted-foreground">Опишите свои навыки и предложите их рынку Туркменистана</p>
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
                disabled={createGig.isPending}
              >
                {createGig.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {status === "draft" ? "Сохранить черновик" : "Опубликовать услугу"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
