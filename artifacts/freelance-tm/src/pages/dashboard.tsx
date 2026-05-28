import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { TrustBadge } from "@/components/trust-badge";
import { TmCellTopup } from "@/components/tmcell-topup";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import {
  useListOrders, useListGigs, useUpdateGig,
  getListOrdersQueryKey, getListGigsQueryKey,
} from "@workspace/api-client-react";
import { ArrowRight, Package, ShoppingBag, Plus, Star, TrendingUp, DollarSign, Eye, EyeOff, Wallet as WalletIcon, Copy, Coins } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const { t } = useI18n();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: buyingOrders, isLoading: ordersLoading } = useListOrders({ role: "buyer" }, {
    query: { enabled: !!user, queryKey: getListOrdersQueryKey({ role: "buyer" }) }
  });

  const { data: sellingOrders, isLoading: sellingLoading } = useListOrders({ role: "seller" }, {
    query: { enabled: !!user && user.role !== "client", queryKey: getListOrdersQueryKey({ role: "seller" }) }
  });

  const { data: myGigs, isLoading: gigsLoading } = useListGigs(
    { sellerId: user?.id },
    { query: { enabled: !!user && user.role !== "client", queryKey: getListGigsQueryKey({ sellerId: user?.id }) } }
  );

  const updateGig = useUpdateGig({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["listGigs"] });
        toast({ title: "Статус услуги обновлён" });
      }
    }
  });

  const toggleGigStatus = (gigId: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    updateGig.mutate({ gigId, data: { status: newStatus } });
  };

  const copyWallet = () => {
    if (user?.walletAddress) {
      navigator.clipboard.writeText(user.walletAddress);
      setCopied(true);
      toast({ title: "Адрес кошелька скопирован" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (authLoading || !user) {
    return <Layout><div className="container mx-auto p-20 text-center text-muted-foreground">{t.common.loading}</div></Layout>;
  }

  const totalRevenue = sellingOrders?.filter(o => o.status === "completed").reduce((sum, o) => sum + o.totalPrice, 0) ?? 0;
  const activeSellingCount = sellingOrders?.filter(o => ["pending", "active"].includes(o.status)).length ?? 0;
  const tonBalance = user.balanceNano ? (parseInt(user.balanceNano) / 1e9).toFixed(4) : "0";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">{t.dashboard.welcome}, {user.displayName || user.username} 👋</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t.dashboard.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!user.onboardingCompleted && (
              <Link href="/onboarding">
                <Button variant="outline" size="sm" className="border-primary/30 text-primary bg-primary/5 gap-2">
                  Заполнить профиль
                  <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">!</span>
                </Button>
              </Link>
            )}
            <TmCellTopup />
            {user.role !== "client" && (
              <Link href="/create-gig">
                <Button className="gap-2" size="sm">
                  <Plus className="w-4 h-4" />
                  {t.dashboard.postGig}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Баланс TON</span>
              </div>
              <div className="text-2xl font-display font-bold">{tonBalance} TON</div>
              {user.walletAddress && (
                <button
                  onClick={copyWallet}
                  className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 hover:text-primary transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? "Скопировано" : `${user.walletAddress.slice(0, 8)}...${user.walletAddress.slice(-6)}`}
                </button>
              )}
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-400" />
                <span className="text-xs text-muted-foreground">{t.dashboard.totalRevenue}</span>
              </div>
              <div className="text-2xl font-display font-bold">${totalRevenue.toFixed(0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">{t.dashboard.activeOrders}</span>
              </div>
              <div className="text-2xl font-display font-bold">{activeSellingCount}</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-muted-foreground">{t.dashboard.rating}</span>
              </div>
              <div className="text-2xl font-display font-bold">{user.rating?.toFixed(1) || "—"}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue={user.role === "freelancer" ? "selling" : "buying"} className="w-full">
          <TabsList className="mb-6 bg-white/5 border border-white/10 p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="buying" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
              {t.dashboard.myOrders}
              {buyingOrders && buyingOrders.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{buyingOrders.length}</span>
              )}
            </TabsTrigger>
            {user.role !== "client" && (
              <>
                <TabsTrigger value="selling" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
                  {t.dashboard.mySales}
                  {activeSellingCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-green-500/30 text-xs text-green-300">{activeSellingCount}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="gigs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
                  {t.dashboard.myGigs}
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* BUYING */}
          <TabsContent value="buying">
            {ordersLoading ? (
              <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-white/5" />)}</div>
            ) : !buyingOrders?.length ? (
              <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                <ShoppingBag className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                <h3 className="text-lg font-medium mb-2">{t.dashboard.noOrders}</h3>
                <p className="text-muted-foreground text-sm mb-4">{t.dashboard.noOrdersSub}</p>
                <Link href="/gigs"><Button variant="outline">{t.dashboard.browseServices}</Button></Link>
              </div>
            ) : (
              <div className="space-y-3">
                {buyingOrders.map(order => (
                  <div key={order.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={order.status} />
                        <span className="text-xs text-muted-foreground">#{order.id}</span>
                      </div>
                      <h4 className="font-medium text-sm truncate">{order.gigTitle}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.common.from} {order.sellerUsername} • <span className="font-bold text-foreground">${order.totalPrice}</span>
                      </p>
                    </div>
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0">
                        {t.dashboard.viewOrder} <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* SELLING */}
          {user.role !== "client" && (
            <TabsContent value="selling">
              {sellingLoading ? (
                <div className="space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-white/5" />)}</div>
              ) : !sellingOrders?.length ? (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <h3 className="text-lg font-medium mb-2">{t.dashboard.noSales}</h3>
                  <p className="text-muted-foreground text-sm">{t.dashboard.noSalesSub}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sellingOrders.map(order => (
                    <div key={order.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={order.status} />
                          <span className="text-xs text-muted-foreground">#{order.id}</span>
                        </div>
                        <h4 className="font-medium text-sm truncate">{order.gigTitle}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Клиент: {order.buyerUsername} • <span className="font-bold text-foreground">${order.totalPrice}</span>
                        </p>
                      </div>
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1.5 shrink-0 hover:text-primary">
                          {t.dashboard.manageOrder} <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* GIGS */}
          {user.role !== "client" && (
            <TabsContent value="gigs">
              {gigsLoading ? (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-52 bg-white/5 rounded-xl" />)}
                </div>
              ) : !myGigs?.gigs.length ? (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-lg font-medium mb-2">{t.dashboard.noGigs}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{t.dashboard.noGigsSub}</p>
                  <Link href="/create-gig"><Button>{t.dashboard.createFirst}</Button></Link>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {myGigs.gigs.map(gig => (
                    <Card key={gig.id} className="bg-white/5 border-white/10 overflow-hidden">
                      {gig.imageUrl && (
                        <div className="h-28 overflow-hidden">
                          <img src={gig.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-medium text-sm line-clamp-2 flex-1 leading-snug">{gig.title}</h4>
                          <button
                            onClick={() => toggleGigStatus(gig.id, gig.status)}
                            className={`shrink-0 p-1.5 rounded-lg transition-colors ${gig.status === "active" ? "text-green-400 bg-green-400/10 hover:bg-green-400/20" : "text-muted-foreground bg-white/5 hover:bg-white/10"}`}
                            title={gig.status === "active" ? "Приостановить" : "Активировать"}
                          >
                            {gig.status === "active" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={gig.status} />
                            <span className="flex items-center gap-0.5">
                              <Star className="w-3 h-3 text-yellow-500 fill-current" />
                              {gig.rating?.toFixed(1) || "—"}
                            </span>
                          </div>
                          <span className="font-bold text-sm text-foreground">${gig.price}</span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Link href={`/gigs/${gig.id}`} className="flex-1">
                            <Button variant="ghost" size="sm" className="w-full text-xs h-7">Посмотреть</Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
