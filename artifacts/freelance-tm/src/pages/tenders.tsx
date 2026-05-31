import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListCategories } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Clock, DollarSign, Users, Tag, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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

const PAGE_SIZE = 12;

export default function Tenders() {
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);

  const [search, setSearch] = useState(urlParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(urlParams.get("q") ?? "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, categoryId, statusFilter]);

  const { data: categories } = useListCategories();

  const { data, isLoading } = useQuery({
    queryKey: ["tenders", debouncedSearch, categoryId, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categoryId && categoryId !== "all") params.set("categoryId", categoryId);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/tenders?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<{ items: Tender[]; total: number; page: number }>;
    },
    staleTime: 30_000,
  });

  const tenders = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

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

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold mb-1">Тендеры</h1>
            <p className="text-muted-foreground text-sm">Задачи от заказчиков — откликайтесь и выигрывайте проекты</p>
          </div>
          <Link href="/create-tender">
            <Button className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Разместить тендер</span>
              <span className="sm:hidden">Создать</span>
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Поиск тендеров..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white/5 border-white/10"
            />
          </div>
          <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-48 bg-white/5 border-white/10">
              <SelectValue placeholder="Все категории" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">Все категории</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-white/10">
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="open">Открытые</SelectItem>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="closed">Закрытые</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        {!isLoading && (
          <p className="text-sm text-muted-foreground mb-4">
            Найдено тендеров: <strong>{total}</strong>
          </p>
        )}

        {/* List */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl bg-white/5" />
            ))}
          </div>
        ) : tenders.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-muted-foreground mb-4">Тендеры не найдены</p>
            <Link href="/create-tender">
              <Button variant="outline" className="border-white/10 gap-2">
                <Plus className="w-4 h-4" />
                Создать первый тендер
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenders.map((tender) => (
              <Link key={tender.id} href={`/tenders/${tender.id}`}>
                <Card className="h-full bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/8 transition-all cursor-pointer group">
                  <CardContent className="p-5 flex flex-col gap-3 h-full">
                    {/* Category + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 truncate max-w-[120px]">
                        {tender.categoryName ?? "Без категории"}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor[tender.status] ?? statusColor.open}`}>
                        {statusLabel[tender.status] ?? tender.status}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-display font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {tender.title}
                    </h3>

                    {/* Description snippet */}
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
                      {tender.description}
                    </p>

                    {/* Skills */}
                    {tender.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tender.skills.slice(0, 4).map((skill) => (
                          <span key={skill} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-muted-foreground">
                            #{skill}
                          </span>
                        ))}
                        {tender.skills.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{tender.skills.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1 font-semibold text-foreground">
                        <DollarSign className="w-3.5 h-3.5 text-primary" />
                        {tender.budget}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {tender.proposalCount} откликов
                      </div>
                      {tender.deadline && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(tender.deadline).toLocaleDateString("ru-RU", { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>

                    {/* Buyer */}
                    <div className="flex items-center gap-2 pt-1">
                      <div className="w-5 h-5 rounded-full bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold">
                        {tender.buyerAvatarUrl ? (
                          <img src={tender.buyerAvatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          tender.buyerName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{tender.buyerName}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {new Date(tender.createdAt).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 gap-1"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </Button>
            <span className="text-sm text-muted-foreground px-4">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 gap-1"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Далее
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
