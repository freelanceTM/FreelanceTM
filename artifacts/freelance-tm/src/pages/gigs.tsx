import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FavoriteButton } from "@/components/favorite-button";
import { TrustBadge } from "@/components/trust-badge";
import { useListCategories, useListGigs } from "@workspace/api-client-react";
import { useI18n } from "@/lib/i18n";
import { Component, Search, Star, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type SortBy = "newest" | "rating" | "price_asc" | "price_desc" | "orders";
const PAGE_SIZE = 9;

export default function Gigs() {
  const { t } = useI18n();
  const searchStr = useSearch();

  // Parse URL params on mount
  const urlParams = new URLSearchParams(searchStr);
  const urlQ = urlParams.get("q") ?? "";
  const urlCatId = urlParams.get("categoryId") ? parseInt(urlParams.get("categoryId")!) : undefined;

  const [search, setSearch] = useState(urlQ);
  const [debouncedSearch, setDebouncedSearch] = useState(urlQ);
  const [categoryId, setCategoryId] = useState<number | undefined>(urlCatId);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Sync URL params → state when navigating from another page (e.g. home search)
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const q = params.get("q") ?? "";
    const catId = params.get("categoryId") ? parseInt(params.get("categoryId")!) : undefined;
    setSearch(q);
    setDebouncedSearch(q);
    setCategoryId(catId);
  }, [searchStr]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, categoryId, sortBy, minPrice, maxPrice]);

  const { data: categories } = useListCategories();

  const { data: gigsData, isLoading } = useListGigs({
    search: debouncedSearch || undefined,
    categoryId,
    sortBy,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const totalPages = gigsData ? Math.ceil(gigsData.total / PAGE_SIZE) : 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategoryId(undefined);
    setMinPrice("");
    setMaxPrice("");
    setSortBy("newest");
  };

  const hasFilters = debouncedSearch || categoryId || minPrice || maxPrice || sortBy !== "newest";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2">{t.gigs.title}</h1>
          {gigsData && (
            <p className="text-muted-foreground text-sm">{gigsData.total} услуг доступно</p>
          )}
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t.gigs.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-white/10"
            />
          </div>
          <Button type="submit">{t.gigs.searchBtn}</Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={`border-white/10 ${showFilters ? "bg-primary/10 border-primary/30" : "bg-white/5"}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </form>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Sidebar */}
          <aside className={`w-full md:w-56 shrink-0 space-y-6 ${showFilters ? "block" : "hidden md:block"}`}>
            <div>
              <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">{t.gigs.filterTitle}</h3>
              <div className="space-y-1.5">
                <button
                  onClick={() => setCategoryId(undefined)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm font-medium ${!categoryId ? "bg-primary/10 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                >
                  {t.gigs.allCategories}
                </button>
                {categories?.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm flex items-center justify-between ${categoryId === cat.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-white/5 text-muted-foreground"}`}
                  >
                    <span>{cat.name}</span>
                    <span className="text-xs opacity-60">{cat.gigCount}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t.gigs.priceRange}</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">{t.gigs.minPrice}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={minPrice}
                    onChange={e => setMinPrice(e.target.value)}
                    placeholder="0"
                    className="bg-background/50 border-white/10 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">{t.gigs.maxPrice}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={maxPrice}
                    onChange={e => setMaxPrice(e.target.value)}
                    placeholder="∞"
                    className="bg-background/50 border-white/10 h-8 text-sm"
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full border-white/10 text-xs"
                onClick={() => setDebouncedSearch(search)}
              >
                Применить
              </Button>
            </div>

            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground gap-1.5 text-xs"
                onClick={clearFilters}
              >
                <X className="w-3 h-3" />
                {t.gigs.clearFilters}
              </Button>
            )}
          </aside>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Sort bar */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm text-muted-foreground">
                {isLoading ? "..." : `${gigsData?.gigs.length || 0} результатов`}
              </span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="w-44 bg-background/50 border-white/10 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-white/10">
                  <SelectItem value="newest">{t.gigs.sortNewest}</SelectItem>
                  <SelectItem value="rating">{t.gigs.sortRating}</SelectItem>
                  <SelectItem value="orders">{t.gigs.sortOrders}</SelectItem>
                  <SelectItem value="price_asc">{t.gigs.sortPriceAsc}</SelectItem>
                  <SelectItem value="price_desc">{t.gigs.sortPriceDesc}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array(PAGE_SIZE).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-[330px] w-full bg-white/5 rounded-xl" />
                ))}
              </div>
            ) : gigsData?.gigs.length === 0 ? (
              <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                <Component className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-display font-semibold mb-2">{t.gigs.noResults}</h3>
                <p className="text-muted-foreground mb-4">{t.gigs.noResultsSub}</p>
                {hasFilters && (
                  <Button variant="outline" className="border-white/10" onClick={clearFilters}>
                    {t.gigs.clearFilters}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {gigsData?.gigs.map((gig) => (
                    <div key={gig.id} className="relative group">
                      <Link href={`/gigs/${gig.id}`}>
                        <Card className="h-full bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all overflow-hidden flex flex-col cursor-pointer">
                          {gig.imageUrl ? (
                            <div className="w-full h-44 overflow-hidden relative">
                              <img
                                src={gig.imageUrl}
                                alt={gig.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              {gig.sellerIsVerified && (
                                <div className="absolute top-2 left-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-xs font-medium text-primary border border-primary/30">
                                    ✓ Verified
                                  </span>
                                </div>
                              )}
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
                              {gig.sellerLevel && gig.sellerLevel !== "new" && (
                                <TrustBadge level={gig.sellerLevel as any} size="sm" />
                              )}
                            </div>
                            <h3 className="font-semibold text-sm leading-snug mb-auto line-clamp-2 group-hover:text-primary transition-colors">
                              {gig.title}
                            </h3>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                              <div className="flex items-center gap-1 text-yellow-500">
                                <Star className="w-3.5 h-3.5 fill-current" />
                                <span className="text-xs font-bold">{gig.rating?.toFixed(1) || t.gigs.new}</span>
                                {(gig.reviewCount ?? 0) > 0 && (
                                  <span className="text-xs text-muted-foreground">({gig.reviewCount})</span>
                                )}
                              </div>
                              <div className="font-display font-bold text-lg">${gig.price}</div>
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

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-10 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-white/10 bg-white/5"
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                      if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
                        return (
                          <Button
                            key={p}
                            variant={p === page ? "default" : "outline"}
                            size="icon"
                            className={`h-9 w-9 ${p !== page ? "border-white/10 bg-white/5 text-muted-foreground" : ""}`}
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </Button>
                        );
                      }
                      if (p === page - 2 || p === page + 2) {
                        return <span key={p} className="text-muted-foreground px-1">…</span>;
                      }
                      return null;
                    })}

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-white/10 bg-white/5"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>

                    <span className="text-xs text-muted-foreground ml-2">
                      Стр. {page} из {totalPages}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
