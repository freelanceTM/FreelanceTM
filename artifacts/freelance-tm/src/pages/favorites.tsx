import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FavoriteButton } from "@/components/favorite-button";
import { TrustBadge } from "@/components/trust-badge";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { useListFavorites, useListGigs, getListFavoritesQueryKey, getListGigsQueryKey } from "@workspace/api-client-react";
import { Heart, Star } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";

export default function Favorites() {
  const { t } = useI18n();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: favoriteIds, isLoading: favsLoading } = useListFavorites({
    query: { enabled: !!user, queryKey: getListFavoritesQueryKey() }
  });

  const { data: gigsData, isLoading: gigsLoading } = useListGigs(
    { limit: 100 },
    { query: { enabled: (favoriteIds?.length ?? 0) > 0, queryKey: getListGigsQueryKey({ limit: 100 }) } }
  );

  const favoriteGigs = gigsData?.gigs.filter(g => favoriteIds?.includes(g.id)) ?? [];
  const isLoading = favsLoading || gigsLoading;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mb-8 flex items-center gap-3">
          <Heart className="w-6 h-6 text-red-400 fill-current" />
          <h1 className="text-3xl font-display font-bold">Избранное</h1>
          {favoriteIds && (
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-sm text-muted-foreground">{favoriteIds.length}</span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-[280px] bg-white/5 rounded-xl" />)}
          </div>
        ) : favoriteGigs.length === 0 ? (
          <div className="text-center py-24 bg-white/5 rounded-2xl border border-white/10">
            <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <h3 className="text-xl font-display font-semibold mb-2">Нет сохранённых услуг</h3>
            <p className="text-muted-foreground mb-6">Нажмите на ❤ на любой услуге чтобы сохранить её сюда</p>
            <Link href="/gigs">
              <Button>Перейти в каталог</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {favoriteGigs.map((gig) => (
              <div key={gig.id} className="relative group">
                <Link href={`/gigs/${gig.id}`}>
                  <Card className="h-full bg-white/5 border-white/10 hover:bg-white/[0.08] transition-all overflow-hidden cursor-pointer">
                    {gig.imageUrl ? (
                      <div className="w-full h-40 overflow-hidden">
                        <img src={gig.imageUrl} alt={gig.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-primary/20 to-secondary/20" />
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-5 h-5 rounded-full bg-white/10 overflow-hidden shrink-0">
                          {gig.sellerAvatarUrl && <img src={gig.sellerAvatarUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{gig.sellerDisplayName || gig.sellerUsername}</span>
                        {gig.sellerIsVerified && <TrustBadge isVerified size="sm" />}
                      </div>
                      <h3 className="font-semibold text-sm line-clamp-2 leading-snug mb-3 group-hover:text-primary transition-colors">
                        {gig.title}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-yellow-500">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span className="text-xs font-bold">{gig.rating?.toFixed(1) || "New"}</span>
                        </div>
                        <span className="font-display font-bold">${gig.price}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <div className="absolute top-2 right-2 z-10">
                  <FavoriteButton gigId={gig.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
