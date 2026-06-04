import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrustBadge } from "@/components/trust-badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, DollarSign, Users, Tag, Star, CheckCircle2,
  ChevronLeft, Send, Sparkles, Shield
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type Tender = {
  id: number;
  title: string;
  description: string;
  budget: number;
  categoryId: number | null;
  categoryName: string | null;
  buyerId: number;
  buyerName: string;
  buyerAvatarUrl: string | null;
  status: "open" | "in_progress" | "closed";
  proposalCount: number;
  deadline: string | null;
  skills: string[];
  createdAt: string;
};

type Bid = {
  id: number;
  tenderId: number;
  freelancerId: number;
  freelancerName: string;
  freelancerAvatarUrl: string | null;
  freelancerLevel: string | null;
  freelancerRating: number | null;
  price: number;
  deliveryDays: number;
  message: string | null;
  isSelected: boolean;
  createdAt: string;
};

type MatchedFreelancer = {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: string | null;
  rating: number | null;
  completedOrders: number | null;
  isVerified: boolean;
  matchScore: number;
  tags: string[];
  topGig: string | null;
};

function getToken() {
  try {
    return JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";
  } catch {
    return "";
  }
}

const statusLabel: Record<string, string> = {
  open: "Открыт",
  in_progress: "В работе",
  closed: "Закрыт",
};
const statusColor: Record<string, string> = {
  open: "text-green-400 bg-green-400/10 border-green-400/20",
  in_progress: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  closed: "text-muted-foreground bg-white/5 border-white/10",
};

export default function TenderDetail({ params }: { params: { id: string } }) {
  const tenderId = parseInt(params.id, 10);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [isBidOpen, setIsBidOpen] = useState(false);
  const [bidPrice, setBidPrice] = useState("");
  const [bidDays, setBidDays] = useState("");
  const [bidMessage, setBidMessage] = useState("");

  const { data: tender, isLoading } = useQuery({
    queryKey: ["tender", tenderId],
    queryFn: async () => {
      const res = await fetch(`/api/tenders/${tenderId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json() as Promise<Tender>;
    },
    enabled: !!tenderId && !isNaN(tenderId),
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["tenderBids", tenderId],
    queryFn: async () => {
      const res = await fetch(`/api/tenders/${tenderId}/bids`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ items: Bid[] }>;
    },
    enabled: !!tenderId && !!user && tender?.buyerId === user?.id,
  });

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ["tenderMatch", tenderId],
    queryFn: async () => {
      const res = await fetch(`/api/ai/match-freelancers/${tenderId}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ items: MatchedFreelancer[] }>;
    },
    enabled: !!tenderId && !isNaN(tenderId),
    staleTime: 60_000,
  });

  const submitBid = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenders/${tenderId}/bid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          price: Number(bidPrice),
          deliveryDays: Number(bidDays),
          message: bidMessage || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Ошибка");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Предложение отправлено!" });
      setIsBidOpen(false);
      qc.invalidateQueries({ queryKey: ["tender", tenderId] });
    },

  });

  const selectBid = useMutation({
    mutationFn: async (bidId: number) => {
      const res = await fetch(`/api/tenders/${tenderId}/select-bid/${bidId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Ошибка");
      }
      return res.json() as Promise<{ order: { id: number } }>;
    },
    onSuccess: (data) => {
      toast({ title: "Исполнитель выбран, заказ создан!" });
      setLocation(`/orders/${data.order.id}`);
    },

  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
          <Skeleton className="h-8 w-48 bg-white/5 mb-6" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <Skeleton className="h-10 w-3/4 bg-white/5" />
              <Skeleton className="h-40 w-full bg-white/5" />
            </div>
            <Skeleton className="h-60 bg-white/5 rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!tender) {
    return (
      <Layout>
        <div className="p-20 text-center text-muted-foreground">Тендер не найден</div>
      </Layout>
    );
  }

  const isOwner = user?.id === tender.buyerId;
  const canBid = isAuthenticated && !isOwner && tender.status === "open" && user?.role !== "client";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
        {/* Back */}
        <Link href="/tenders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Все тендеры
        </Link>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="md:col-span-2 space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-start gap-3 mb-3">
                <h1 className="text-2xl md:text-3xl font-display font-bold leading-tight flex-1">
                  {tender.title}
                </h1>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 mt-1 ${statusColor[tender.status]}`}>
                  {statusLabel[tender.status]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {tender.categoryName && (
                  <span className="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                    {tender.categoryName}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {tender.proposalCount} откликов
                </span>
                {tender.deadline && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Дедлайн: {new Date(tender.deadline).toLocaleDateString("ru-RU")}
                  </span>
                )}
                <span className="text-xs">
                  Опубликован {new Date(tender.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="p-5 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold mb-3">Описание задачи</h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-sm">
                {tender.description}
              </p>
            </div>

            {/* Skills */}
            {(tender.skills ?? []).length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  Требуемые навыки
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(tender.skills ?? []).map((skill) => (
                    <span key={skill} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground">
                      #{skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Recommended Freelancers (AI matching) ──────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="font-semibold">Рекомендуемые исполнители</h3>
                <span className="text-xs text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                  AI подбор
                </span>
              </div>
              {matchLoading ? (
                <div className="space-y-2">
                  {Array(3).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : !matchData?.items?.length ? (
                <div className="p-6 rounded-xl bg-white/5 border border-white/10 text-center text-sm text-muted-foreground">
                  Подходящие исполнители не найдены — добавьте больше навыков к тендеру
                </div>
              ) : (
                <div className="space-y-3">
                  {matchData.items.map((fl, idx) => (
                    <Link key={fl.userId} href={`/profile/${fl.userId}`}>
                      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/8 transition-all cursor-pointer group">
                        {/* Rank badge */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                          ${idx === 0 ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                            : idx === 1 ? "bg-white/10 text-foreground border border-white/20"
                            : "bg-white/5 text-muted-foreground border border-white/10"}`}
                        >
                          {idx + 1}
                        </div>

                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold">
                          {fl.avatarUrl ? (
                            <img src={fl.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            fl.displayName.charAt(0).toUpperCase()
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm group-hover:text-primary transition-colors truncate">
                              {fl.displayName}
                            </span>
                            <TrustBadge isVerified={fl.isVerified} level={fl.level as Parameters<typeof TrustBadge>[0]["level"]} size="sm" />
                          </div>
                          {fl.topGig && (
                            <p className="text-xs text-muted-foreground truncate">{fl.topGig}</p>
                          )}
                          {fl.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {fl.tags.slice(0, 4).map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/80">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Rating */}
                        <div className="text-right shrink-0">
                          {fl.rating != null && fl.rating > 0 ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                              <span className="text-sm font-bold text-yellow-400">{fl.rating.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Новый</span>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            совпадение {fl.matchScore}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Bids list (owner only) */}
            {isOwner && tender.status === "open" && (
              <div>
                <h3 className="font-semibold mb-4">
                  Предложения ({bids?.items?.length ?? 0})
                </h3>
                {bidsLoading ? (
                  <Skeleton className="h-32 w-full bg-white/5" />
                ) : !bids?.items?.length ? (
                  <div className="p-6 rounded-xl bg-white/5 border border-white/10 text-center text-sm text-muted-foreground">
                    Предложений пока нет — ждите откликов от фрилансеров
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bids.items.map((bid) => (
                      <div key={bid.id} className={`p-4 rounded-xl border transition-all ${bid.isSelected ? "bg-green-500/5 border-green-500/20" : "bg-white/5 border-white/10"}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold">
                            {bid.freelancerAvatarUrl ? (
                              <img src={bid.freelancerAvatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              bid.freelancerName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <Link href={`/profile/${bid.freelancerId}`}>
                                <span className="font-medium text-sm hover:text-primary transition-colors">{bid.freelancerName}</span>
                              </Link>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-primary">${bid.price}</span>
                                <span className="text-xs text-muted-foreground">· {bid.deliveryDays} дн.</span>
                              </div>
                            </div>
                            {bid.message && (
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{bid.message}</p>
                            )}
                          </div>
                        </div>
                        {!bid.isSelected && tender.status === "open" && (
                          <Button
                            size="sm"
                            className="mt-3 w-full gap-2 bg-green-600 hover:bg-green-700"
                            onClick={() => selectBid.mutate(bid.id)}
                            disabled={selectBid.isPending}
                          >
                            {selectBid.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Выбрать исполнителя
                          </Button>
                        )}
                        {bid.isSelected && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Исполнитель выбран
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="sticky top-24 space-y-4">
              {/* Budget card */}
              <Card className="bg-background border-white/10">
                <CardContent className="p-5">
                  <div className="flex items-baseline justify-between mb-4">
                    <span className="text-muted-foreground text-sm">Бюджет</span>
                    <div className="text-3xl font-display font-bold text-primary flex items-baseline">
                      <DollarSign className="w-5 h-5 mr-0.5" />
                      {tender.budget}
                    </div>
                  </div>

                  <div className="space-y-2 mb-5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="text-green-400">Оплата через эскроу</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>{tender.proposalCount} фрилансеров откликнулись</span>
                    </div>
                    {tender.deadline && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>до {new Date(tender.deadline).toLocaleDateString("ru-RU")}</span>
                      </div>
                    )}
                  </div>

                  {canBid ? (
                    <Dialog open={isBidOpen} onOpenChange={setIsBidOpen}>
                      <DialogTrigger asChild>
                        <Button className="w-full gap-2 shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                          <Send className="w-4 h-4" />
                          Отправить предложение
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-white/10">
                        <DialogHeader>
                          <DialogTitle>Ваше предложение</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Цена (USD)</Label>
                              <Input
                                type="number"
                                min={1}
                                placeholder="150"
                                value={bidPrice}
                                onChange={(e) => setBidPrice(e.target.value)}
                                className="bg-background/50 border-white/10"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Срок (дней)</Label>
                              <Input
                                type="number"
                                min={1}
                                max={365}
                                placeholder="7"
                                value={bidDays}
                                onChange={(e) => setBidDays(e.target.value)}
                                className="bg-background/50 border-white/10"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Сопроводительное сообщение</Label>
                            <Textarea
                              placeholder="Расскажите о своём опыте, почему подходите для этой задачи..."
                              value={bidMessage}
                              onChange={(e) => setBidMessage(e.target.value)}
                              className="min-h-[120px] bg-background/50 border-white/10"
                            />
                          </div>
                          <Button
                            className="w-full"
                            onClick={() => submitBid.mutate()}
                            disabled={!bidPrice || !bidDays || submitBid.isPending}
                          >
                            {submitBid.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {submitBid.isPending ? "Отправляем..." : "Отправить предложение"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : !isAuthenticated ? (
                    <Link href="/login">
                      <Button className="w-full">Войти для участия</Button>
                    </Link>
                  ) : isOwner ? (
                    <Button className="w-full" variant="outline" disabled>Ваш тендер</Button>
                  ) : tender.status !== "open" ? (
                    <Button className="w-full" variant="outline" disabled>Тендер закрыт</Button>
                  ) : null}
                </CardContent>
              </Card>

              {/* Buyer card */}
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-3">Заказчик</p>
                  <Link href={`/profile/${tender.buyerId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold">
                      {tender.buyerAvatarUrl ? (
                        <img src={tender.buyerAvatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        tender.buyerName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{tender.buyerName}</div>
                      <div className="text-xs text-muted-foreground">Просмотреть профиль →</div>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
