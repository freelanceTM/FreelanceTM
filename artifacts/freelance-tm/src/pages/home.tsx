import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetPlatformStats, useListCategories, useListFeaturedGigs } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import {
  ArrowRight, Code, Component, Megaphone, MessageSquare,
  Paintbrush, Play, Search, Sparkles, Star, TrendingUp, Zap,
  Shield, Clock, CheckCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { FavoriteButton } from "@/components/favorite-button";

export default function Home() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [heroSearch, setHeroSearch] = useState("");

  const { data: stats, isLoading: statsLoading } = useGetPlatformStats();
  const { data: categories } = useListCategories();
  const { data: featuredGigs, isLoading: gigsLoading } = useListFeaturedGigs();

  const getCategoryIcon = (slug: string) => {
    switch (slug) {
      case "telegram": return <MessageSquare className="w-6 h-6" />;
      case "tiktok": return <Play className="w-6 h-6" />;
      case "design": return <Paintbrush className="w-6 h-6" />;
      case "development": return <Code className="w-6 h-6" />;
      case "ai-services": return <Sparkles className="w-6 h-6" />;
      default: return <Component className="w-6 h-6" />;
    }
  };

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      setLocation(`/gigs?q=${encodeURIComponent(heroSearch.trim())}`);
    } else {
      setLocation("/gigs");
    }
  };

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden pt-12 md:pt-20 pb-16 md:pb-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-8 relative z-10">
          <div className="max-w-4xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs md:text-sm font-medium mb-4 md:mb-6 text-primary">
                <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {t.home.badge}
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-bold leading-tight mb-4 md:mb-6">
                {t.home.headline1}{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                  {t.home.headline2}
                </span>{" "}
                {t.home.headline3}
              </h1>

              <p className="text-sm md:text-lg text-muted-foreground mb-6 md:mb-10 max-w-2xl leading-relaxed">
                {t.home.sub}
              </p>

              {/* Search bar */}
              <form onSubmit={handleHeroSearch} className="flex flex-col sm:flex-row gap-2 max-w-2xl mb-5 md:mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                  <Input
                    value={heroSearch}
                    onChange={(e) => setHeroSearch(e.target.value)}
                    placeholder="Telegram бот, TikTok монтаж..."
                    className="pl-10 md:pl-12 h-12 md:h-14 text-sm md:text-base bg-white/5 border-white/20 focus:border-primary/50 rounded-xl"
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 md:h-14 px-6 md:px-8 text-sm md:text-base rounded-xl shrink-0">
                  {t.home.cta1}
                </Button>
              </form>

              <div className="flex flex-wrap gap-2 text-xs md:text-sm text-muted-foreground">
                <span className="self-center">Популярные:</span>
                {["Telegram бот", "TikTok", "Логотип", "Чат-бот"].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setLocation(`/gigs?q=${encodeURIComponent(q)}`)}
                    className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-10 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 pt-6 md:pt-8 border-t border-white/10"
            >
              {statsLoading
                ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full bg-white/5" />)
                : stats && (
                  <>
                    <div>
                      <div className="text-3xl font-display font-bold mb-1">{stats.totalFreelancers}+</div>
                      <div className="text-sm text-muted-foreground">{t.home.statsFreelancers}</div>
                    </div>
                    <div>
                      <div className="text-3xl font-display font-bold mb-1">{stats.totalGigs}+</div>
                      <div className="text-sm text-muted-foreground">{t.home.statsGigs}</div>
                    </div>
                    <div>
                      <div className="text-3xl font-display font-bold mb-1">{stats.totalOrders}+</div>
                      <div className="text-sm text-muted-foreground">{t.home.statsOrders}</div>
                    </div>
                    <div>
                      <div className="text-3xl font-display font-bold mb-1">{stats.topCategories?.length ?? 5}</div>
                      <div className="text-sm text-muted-foreground">{t.home.statsCategories}</div>
                    </div>
                  </>
                )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 bg-white/[0.02]">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl font-display font-bold mb-2">Категории услуг</h2>
              <p className="text-muted-foreground">Только цифровые профессии — актуальные для рынка</p>
            </div>
            <Link href="/gigs">
              <Button variant="ghost" className="hidden md:flex gap-2">
                Все услуги <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {!categories
              ? Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-36 w-full bg-white/5 rounded-xl" />)
              : categories.map((cat) => (
                <Link key={cat.id} href={`/gigs?categoryId=${cat.id}`}>
                  <Card className="h-full bg-background border-white/10 hover:border-primary/40 hover:-translate-y-1 transition-all cursor-pointer group">
                    <CardContent className="p-5 flex flex-col items-center text-center h-full justify-center">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                        {getCategoryIcon(cat.slug)}
                      </div>
                      <h3 className="font-display font-semibold text-sm mb-1">{cat.name}</h3>
                      <p className="text-xs text-muted-foreground">{cat.gigCount} услуг</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* Featured Gigs */}
      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-center gap-3 mb-10">
            <TrendingUp className="w-7 h-7 text-primary" />
            <div>
              <h2 className="text-3xl font-display font-bold">{t.home.featuredTitle}</h2>
              <p className="text-muted-foreground text-sm mt-1">{t.home.featuredSub}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {gigsLoading
              ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-[320px] w-full bg-white/5 rounded-xl" />)
              : featuredGigs?.map((gig) => (
                <div key={gig.id} className="relative group">
                  <Link href={`/gigs/${gig.id}`}>
                    <Card className="h-full bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all overflow-hidden flex flex-col cursor-pointer">
                      {gig.imageUrl ? (
                        <div className="w-full h-44 overflow-hidden">
                          <img
                            src={gig.imageUrl}
                            alt={gig.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-44 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                          <Component className="w-12 h-12 text-white/20" />
                        </div>
                      )}
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0">
                            {gig.sellerAvatarUrl && <img src={gig.sellerAvatarUrl} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <span className="text-xs font-medium text-muted-foreground truncate">{gig.sellerDisplayName || gig.sellerUsername}</span>
                        </div>
                        <h3 className="font-semibold text-sm leading-snug mb-auto line-clamp-2 group-hover:text-primary transition-colors">
                          {gig.title}
                        </h3>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                          <div className="flex items-center gap-1 text-yellow-500">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span className="text-xs font-bold">{gig.rating?.toFixed(1) || "New"}</span>
                            {(gig.reviewCount ?? 0) > 0 && (
                              <span className="text-xs text-muted-foreground">({gig.reviewCount})</span>
                            )}
                          </div>
                          <div className="font-display font-bold">${gig.price}</div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <FavoriteButton gigId={gig.id} />
                  </div>
                </div>
              ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/gigs">
              <Button size="lg" variant="outline" className="border-white/10 gap-2">
                Смотреть все услуги <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">{t.home.howTitle}</h2>
            <p className="text-muted-foreground">{t.home.howSub}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Search, color: "text-primary", bg: "bg-primary/20", title: t.home.step1title, desc: t.home.step1desc, num: "01" },
              { icon: Zap, color: "text-secondary", bg: "bg-secondary/20", title: t.home.step2title, desc: t.home.step2desc, num: "02" },
              { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/20", title: t.home.step3title, desc: t.home.step3desc, num: "03" },
            ].map(({ icon: Icon, color, bg, title, desc, num }) => (
              <div key={num} className="relative text-center px-4">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-6xl font-display font-bold text-white/[0.03] select-none">
                  {num}
                </div>
                <div className={`w-16 h-16 mx-auto ${bg} ${color} rounded-2xl flex items-center justify-center mb-5`}>
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-display font-bold mb-3">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="py-12 border-t border-white/5">
        <div className="container mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: "Безопасная оплата", desc: "Деньги защищены эскроу до подтверждения работы" },
              { icon: CheckCircle, title: "Верификация продавцов", desc: "Все фрилансеры проходят проверку перед публикацией" },
              { icon: Clock, title: "Поддержка 24/7", desc: "Служба поддержки поможет с любым вопросом" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 p-5 rounded-xl bg-white/5 border border-white/10">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{title}</h4>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-background to-secondary/10 pointer-events-none" />
        <div className="container mx-auto px-4 md:px-8 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">{t.home.ctaSection}</h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">{t.home.ctaSub}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/gigs">
              <Button size="lg" className="text-base h-12 px-8 shadow-[0_0_30px_rgba(var(--primary),0.3)]">
                {t.home.cta1} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/create-gig">
              <Button size="lg" variant="outline" className="text-base h-12 px-8 border-white/10 bg-white/5">
                {t.home.cta2}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
