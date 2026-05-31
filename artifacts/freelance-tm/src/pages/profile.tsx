import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrustBadge } from "@/components/trust-badge";
import { FavoriteButton } from "@/components/favorite-button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getGetUserQueryKey, useGetUser, useListGigs, getListGigsQueryKey } from "@workspace/api-client-react";
import { MapPin, Calendar, Star, MessageCircle, ExternalLink, Clock, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function Profile({ params }: { params: { userId: string } }) {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const userId = parseInt(params.userId);

  const { data: profile, isLoading } = useGetUser(userId, {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId) }
  });

  const { data: userGigs, isLoading: gigsLoading } = useListGigs(
    { sellerId: userId },
    { query: { enabled: !!userId, queryKey: getListGigsQueryKey({ sellerId: userId }) } }
  );

  const { data: sellerReviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["sellerReviews", userId],
    queryFn: async () => {
      const tok = JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";
      const res = await fetch(`/api/reviews/seller/${userId}`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!res.ok) return [];
      return res.json() as Promise<Array<{
        id: number;
        orderId: number;
        gigId: number;
        gigTitle: string | null;
        rating: number;
        comment: string | null;
        buyerUsername: string | null;
        buyerAvatarUrl: string | null;
        createdAt: string;
      }>>;
    },
    enabled: !!userId,
  });

  const isOwnProfile = currentUser?.id === userId;

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-56 w-full bg-white/5 rounded-2xl mb-8" />
          <div className="grid md:grid-cols-3 gap-8">
            <Skeleton className="h-64 bg-white/5 rounded-xl" />
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-52 bg-white/5 rounded-xl" />)}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!profile) return <Layout><div className="p-20 text-center text-muted-foreground">Пользователь не найден</div></Layout>;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Cover / Header card */}
        <div className="relative mb-8 rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
          <div className="h-32 md:h-44" />
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-16">
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl border-4 border-background bg-white/10 overflow-hidden flex items-center justify-center text-3xl font-display font-bold shrink-0">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  profile.username.substring(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-display font-bold">{profile.displayName || profile.username}</h1>
                  <TrustBadge isVerified={profile.isVerified} level={profile.level as any} size="sm" />
                </div>
                <p className="text-muted-foreground text-sm">@{profile.username}</p>
                {/* Rating headline */}
                {(profile.rating ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {Array(5).fill(0).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < Math.round(profile.rating ?? 0) ? "text-yellow-400 fill-current" : "text-white/20"}`}
                      />
                    ))}
                    <span className="text-sm font-bold text-yellow-400 ml-1">{(profile.rating ?? 0).toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">({profile.reviewCount} {profile.reviewCount === 1 ? "отзыв" : "отзывов"})</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                {!isOwnProfile && (
                  <Button variant="outline" className="border-white/10 bg-white/5 gap-2" size="sm">
                    <MessageCircle className="w-4 h-4" />
                    {t.profile.message}
                  </Button>
                )}
                {isOwnProfile && (
                  <Link href="/onboarding">
                    <Button variant="outline" className="border-white/10 bg-white/5" size="sm">
                      Редактировать профиль
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Left: Info */}
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-2xl font-display font-bold text-foreground">{profile.completedOrders}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.profile.completedOrders}</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-2xl font-display font-bold text-yellow-500 flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 fill-current" />
                  {(profile.rating ?? 0) > 0 ? (profile.rating ?? 0).toFixed(1) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Рейтинг {profile.reviewCount > 0 ? `(${profile.reviewCount})` : ""}
                </div>
              </div>
            </div>

            {/* Trust info */}
            <TrustBadge
              isVerified={profile.isVerified}
              level={profile.level as any}
              responseTime={profile.responseTime}
              completedOrders={profile.completedOrders}
              showAll
            />

            {/* Meta */}
            <div className="space-y-2.5 pt-4 border-t border-white/10 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{profile.country === "TM" ? "Туркменистан" : (profile.country || "Туркменистан")}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{t.profile.joined} {new Date(profile.createdAt).toLocaleDateString("ru-RU", { year: "numeric", month: "long" })}</span>
              </div>
              {profile.responseTime && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>{t.profile.responseTime} ~{profile.responseTime}{t.profile.hours}</span>
                </div>
              )}
              {profile.telegramUsername && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <a
                    href={`https://t.me/${profile.telegramUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    @{profile.telegramUsername}
                  </a>
                </div>
              )}
            </div>

            {profile.bio && (
              <div className="pt-4 border-t border-white/10">
                <h3 className="font-semibold mb-2">{t.profile.about}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {profile.skills && profile.skills.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <h3 className="font-semibold mb-3">{t.profile.skills}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <span key={skill} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.portfolioUrls && profile.portfolioUrls.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <h3 className="font-semibold mb-3">{t.profile.portfolio}</h3>
                <div className="space-y-2">
                  {profile.portfolioUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-primary hover:underline truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {url.replace(/^https?:\/\//, "")}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {profile.languages && profile.languages.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <h3 className="font-semibold mb-2">{t.profile.languages}</h3>
                <div className="flex gap-1.5">
                  {profile.languages.map((lang) => (
                    <span key={lang} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs uppercase font-bold text-muted-foreground">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Gigs + Reviews */}
          <div className="md:col-span-2 space-y-10">
            {/* Gigs */}
            <div>
              <h2 className="text-xl font-display font-bold mb-5">{t.profile.offeredServices}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {gigsLoading ? (
                  Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-56 w-full bg-white/5 rounded-xl" />)
                ) : !userGigs?.gigs.length ? (
                  <div className="sm:col-span-2 text-center py-12 bg-white/5 rounded-xl border border-white/10">
                    <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-muted-foreground text-sm">{t.profile.noGigs}</p>
                  </div>
                ) : (
                  userGigs.gigs.map((gig) => (
                    <div key={gig.id} className="relative group">
                      <Link href={`/gigs/${gig.id}`}>
                        <Card className="h-full bg-white/5 hover:bg-white/[0.08] border-white/10 transition-all cursor-pointer group">
                          {gig.imageUrl && (
                            <div className="h-36 overflow-hidden rounded-t-xl">
                              <img src={gig.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <h3 className="font-semibold text-sm line-clamp-2 mb-3 group-hover:text-primary transition-colors leading-snug">
                              {gig.title}
                            </h3>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1 text-yellow-500">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <span className="text-xs font-bold">{gig.rating?.toFixed(1) || "—"}</span>
                                {(gig.reviewCount ?? 0) > 0 && <span className="text-xs text-muted-foreground">({gig.reviewCount})</span>}
                              </div>
                              <span className="font-display font-bold">${gig.price}</span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FavoriteButton gigId={gig.id} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reviews */}
            <div>
              <h2 className="text-xl font-display font-bold mb-5 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                Отзывы покупателей
                {(profile.reviewCount ?? 0) > 0 && (
                  <span className="text-sm font-normal text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">
                    {profile.reviewCount}
                  </span>
                )}
              </h2>

              {reviewsLoading ? (
                <div className="space-y-4">
                  {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full bg-white/5 rounded-xl" />)}
                </div>
              ) : !sellerReviews?.length ? (
                <div className="p-8 bg-white/5 rounded-xl border border-white/10 text-center">
                  <Star className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                  <p className="text-muted-foreground text-sm">Пока нет отзывов</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sellerReviews.map((review) => (
                    <div
                      key={review.id}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/[0.07] transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold">
                          {review.buyerAvatarUrl ? (
                            <img src={review.buyerAvatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (review.buyerUsername ?? "?").substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-sm">{review.buyerUsername ?? "Покупатель"}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString("ru-RU")}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 mb-2">
                            {Array(5).fill(0).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3.5 h-3.5 ${i < review.rating ? "text-yellow-400 fill-current" : "text-white/20"}`}
                              />
                            ))}
                          </div>
                          {review.comment && (
                            <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
                          )}
                          {review.gigTitle && (
                            <Link
                              href={`/gigs/${review.gigId}`}
                              className="text-xs text-primary/70 hover:text-primary mt-1 inline-block transition-colors"
                            >
                              {review.gigTitle}
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
