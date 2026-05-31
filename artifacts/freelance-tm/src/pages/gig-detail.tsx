import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FavoriteButton } from "@/components/favorite-button";
import { TrustBadge } from "@/components/trust-badge";
import { useI18n } from "@/lib/i18n";
import { useGetGig, useListGigReviews, useCreateOrder, useGetUser, getGetUserQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Clock, Component, MessageSquare, Star, Shield, Zap, RefreshCw } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { TZGenerator } from "@/components/tz-generator";

export default function GigDetail({ params }: { params: { id: string } }) {
  const { t } = useI18n();
  const id = parseInt(params.id);
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: gig, isLoading } = useGetGig(id, { query: { enabled: !!id, queryKey: ["getGig", id] as const } });
  const { data: reviews, isLoading: reviewsLoading } = useListGigReviews(id, { query: { enabled: !!id, queryKey: ["listGigReviews", id] as const } });

  const { data: sellerProfile } = useGetUser(
    gig?.sellerId ?? 0,
    { query: { enabled: !!gig?.sellerId, queryKey: getGetUserQueryKey(gig?.sellerId ?? 0) } }
  );

  const [requirements, setRequirements] = useState("");
  const [isOrderOpen, setIsOrderOpen] = useState(false);

  const createOrder = useCreateOrder({
    mutation: {
      onSuccess: (data) => {
        setIsOrderOpen(false);
        toast({ title: "Заказ размещён успешно!" });
        setLocation(`/orders/${data.id}`);
      },
      onError: () => {
        toast({ title: "Не удалось разместить заказ", variant: "destructive" });
      },
    },
  });

  const handleOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requirements.trim()) {
      toast({ title: "Укажите требования к заказу", variant: "destructive" });
      return;
    }
    createOrder.mutate({ data: { gigId: id, requirements } });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-4">
              <Skeleton className="h-10 w-3/4 bg-white/5" />
              <Skeleton className="h-4 w-1/2 bg-white/5" />
              <Skeleton className="aspect-video w-full bg-white/5 rounded-xl mt-4" />
              <Skeleton className="h-40 w-full bg-white/5" />
            </div>
            <Skeleton className="h-72 w-full bg-white/5 rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!gig) return <Layout><div className="p-20 text-center text-muted-foreground">Услуга не найдена</div></Layout>;

  const sellerRating = sellerProfile?.rating ?? null;
  const sellerReviewCount = sellerProfile?.reviewCount ?? 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 md:py-12">
        {/* Mobile sticky order bar */}
        <div className="md:hidden fixed bottom-16 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-white/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Стоимость</div>
            <div className="text-xl font-display font-bold text-primary">${gig?.price}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{gig?.deliveryDays} дн.</span>
          </div>
          <div className="flex-1 max-w-[180px]">
            {!isAuthenticated ? (
              <Link href="/login">
                <Button className="w-full h-10 text-sm">{t.gigDetail.signToOrder}</Button>
              </Link>
            ) : user?.id === gig?.sellerId ? (
              <Button className="w-full h-10 text-sm" disabled variant="outline">{t.gigDetail.yourGig}</Button>
            ) : (
              <Dialog open={isOrderOpen} onOpenChange={setIsOrderOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full h-10 text-sm shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                    {t.gigDetail.orderNow}
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-white/10">
                  <DialogHeader>
                    <DialogTitle>Разместить заказ</DialogTitle>
                    <DialogDescription>Подробно опиши задачу — чем детальнее, тем лучше результат.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleOrder} className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="req-mobile">{t.gigDetail.requirements}</Label>
                        <TZGenerator onApply={(text) => setRequirements(text)} />
                      </div>
                      <Textarea
                        id="req-mobile"
                        placeholder={t.gigDetail.requirementsPlaceholder}
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        className="min-h-[140px] bg-background/50 border-white/10"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                      {createOrder.isPending ? "Обработка..." : `${t.gigDetail.confirmOrder} — $${gig?.price}`}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Main */}
          <div className="md:col-span-2 space-y-8 pb-28 md:pb-0">
            {/* Title & Meta */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-3">
                <h1 className="text-2xl md:text-3xl font-display font-bold leading-tight">{gig.title}</h1>
                <FavoriteButton gigId={gig.id} className="shrink-0 mt-1" />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={`/profile/${gig.sellerId}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                  <div className="w-7 h-7 rounded-full bg-white/10 overflow-hidden shrink-0">
                    {gig.sellerAvatarUrl && <img src={gig.sellerAvatarUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="font-medium">{gig.sellerDisplayName || gig.sellerUsername}</span>
                </Link>
                <TrustBadge
                  isVerified={gig.sellerIsVerified}
                  level={gig.sellerLevel as any}
                  size="sm"
                />
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1 text-yellow-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-bold text-foreground">{gig.rating?.toFixed(1) || t.gigs.new}</span>
                  <span className="text-muted-foreground">({gig.reviewCount} {t.gigs.reviews})</span>
                </div>
                <span className="text-white/20">|</span>
                <span className="text-primary text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10">{gig.categoryName}</span>
              </div>
            </div>

            {/* Image */}
            {gig.imageUrl ? (
              <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10">
                <img src={gig.imageUrl} alt={gig.title} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-full aspect-video rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center border border-white/10">
                <Component className="w-20 h-20 text-white/10" />
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="text-xl font-display font-bold mb-4">{t.gigDetail.about}</h3>
              <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-sm">{gig.description}</div>
            </div>

            {/* Tags */}
            {gig.tags && gig.tags.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 text-sm">{t.gigDetail.tags}</h4>
                <div className="flex flex-wrap gap-2">
                  {gig.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Seller info mini */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <Link href={`/profile/${gig.sellerId}`} className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden shrink-0">
                    {gig.sellerAvatarUrl && <img src={gig.sellerAvatarUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <div className="font-semibold">{gig.sellerDisplayName || gig.sellerUsername}</div>
                    <div className="text-xs text-muted-foreground">@{gig.sellerUsername}</div>
                    {/* Seller overall rating */}
                    {sellerRating != null && sellerRating > 0 ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        {Array(5).fill(0).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${i < Math.round(sellerRating) ? "text-yellow-400 fill-current" : "text-white/20"}`}
                          />
                        ))}
                        <span className="text-xs font-bold text-yellow-400 ml-0.5">{sellerRating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">
                          ({sellerReviewCount} {sellerReviewCount === 1 ? "отзыв" : "отзывов"})
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-0.5">Новый исполнитель</div>
                    )}
                  </div>
                </Link>
                <TrustBadge
                  isVerified={gig.sellerIsVerified}
                  level={gig.sellerLevel as any}
                  completedOrders={gig.sellerCompletedOrders ?? undefined}
                  showAll
                />
              </div>
            </div>

            {/* Reviews */}
            <div>
              <h3 className="text-xl font-display font-bold mb-5 flex items-center gap-2">
                {t.gigDetail.reviews}
                <span className="text-sm font-normal text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">{gig.reviewCount}</span>
              </h3>
              {reviewsLoading ? (
                <Skeleton className="h-32 w-full bg-white/5" />
              ) : !reviews?.length ? (
                <div className="p-8 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-muted-foreground text-sm">{t.gigDetail.noReviews}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-b border-white/10 last:border-0 pb-5 last:pb-0">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden shrink-0">
                          {review.reviewerAvatarUrl && <img src={review.reviewerAvatarUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{review.reviewerUsername}</div>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {Array(5).fill(0).map((_, i) => (
                              <Star key={i} className={`w-3 h-3 ${i < review.rating ? "text-yellow-500 fill-current" : "text-white/20"}`} />
                            ))}
                            <span className="text-xs text-muted-foreground ml-2">
                              {new Date(review.createdAt).toLocaleDateString("ru-RU")}
                            </span>
                          </div>
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-muted-foreground text-sm leading-relaxed">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="sticky top-24">
              <Card className="bg-background border-white/10 shadow-2xl">
                <CardContent className="p-6">
                  <div className="flex items-baseline justify-between mb-6">
                    <span className="text-muted-foreground text-sm">Стоимость</span>
                    <div className="text-3xl font-display font-bold text-primary">${gig.price}</div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{gig.deliveryDays} {t.gigDetail.delivery}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{gig.revisions} {t.gigDetail.revisions}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-green-400">
                      <Shield className="w-4 h-4 shrink-0" />
                      <span>{t.gigDetail.secure}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Zap className="w-4 h-4 shrink-0" />
                      <span>{t.gigDetail.chat}</span>
                    </div>
                  </div>

                  {/* Seller rating in sidebar */}
                  {sellerRating != null && sellerRating > 0 && (
                    <div className="mb-5 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-400 fill-current shrink-0" />
                      <div className="text-sm">
                        <span className="font-bold text-yellow-400">{sellerRating.toFixed(1)}</span>
                        <span className="text-muted-foreground ml-1.5">
                          рейтинг исполнителя · {sellerReviewCount} {sellerReviewCount === 1 ? "отзыв" : "отзывов"}
                        </span>
                      </div>
                    </div>
                  )}

                  {!isAuthenticated ? (
                    <Link href="/login">
                      <Button className="w-full h-11">{t.gigDetail.signToOrder}</Button>
                    </Link>
                  ) : user?.id === gig.sellerId ? (
                    <Button className="w-full h-11" disabled variant="outline">{t.gigDetail.yourGig}</Button>
                  ) : (
                    <Dialog open={isOrderOpen} onOpenChange={setIsOrderOpen}>
                      <DialogTrigger asChild>
                        <Button className="w-full h-11 shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                          {t.gigDetail.orderNow} (${gig.price})
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-white/10">
                        <DialogHeader>
                          <DialogTitle>Разместить заказ</DialogTitle>
                          <DialogDescription>
                            Подробно опиши задачу — чем детальнее, тем лучше результат.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleOrder} className="space-y-4 mt-2">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="req">{t.gigDetail.requirements}</Label>
                              <TZGenerator onApply={(text) => setRequirements(text)} />
                            </div>
                            <Textarea
                              id="req"
                              placeholder={t.gigDetail.requirementsPlaceholder}
                              value={requirements}
                              onChange={(e) => setRequirements(e.target.value)}
                              className="min-h-[140px] bg-background/50 border-white/10"
                            />
                          </div>
                          <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                            {createOrder.isPending ? "Обработка..." : `${t.gigDetail.confirmOrder} — $${gig.price}`}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <Link href={`/profile/${gig.sellerId}`}>
                      <Button variant="ghost" className="w-full gap-2 text-muted-foreground hover:text-foreground">
                        <MessageSquare className="w-4 h-4" />
                        {t.gigDetail.contactSeller}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
