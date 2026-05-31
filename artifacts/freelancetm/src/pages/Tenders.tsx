import { useState } from "react";
  import { useLocation, Link } from "wouter";
  import { Layout } from "@/components/Layout";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Card, CardContent } from "@/components/ui/card";
  import { Skeleton } from "@/components/ui/skeleton";
  import { Badge } from "@/components/ui/badge";
  import { Search, Clock, Users, ArrowRight, Briefcase, Plus } from "lucide-react";
  import { useListTenders } from "@workspace/api-client-react";
  import { useAuth } from "@/contexts/AuthContext";
  import { formatDistanceToNow } from "date-fns";

  export default function Tenders() {
    const [searchQuery, setSearchQuery] = useState("");
    const [, setLocation] = useLocation();
    const { user, isAuthenticated } = useAuth();

    const isBuyer = isAuthenticated && user?.role === "buyer";

    const { data: tendersData, isLoading: tendersLoading } = useListTenders({
      search: searchQuery || undefined,
    });

    const tenders = tendersData?.items ?? [];

    return (
      <Layout>
        {/* Hero / search */}
        <div className="bg-muted/30 border-b">
          <div className="container mx-auto max-w-5xl px-4 py-12 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight mb-4">Exchange / Tenders</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Freelancers: find active projects posted by buyers. <br />
              Buyers: post your requirements and let professionals come to you.
            </p>
            <div className="flex max-w-md mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search tenders by keyword..."
                className="pl-10 h-12 text-base rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:border-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button className="h-12 rounded-l-none px-8 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground">
                Search
              </Button>
            </div>

            {/* Buyer CTA — only shown to buyer accounts */}
            {isBuyer && (
              <div className="mt-8 inline-flex flex-col items-center gap-2">
                <Button
                  size="lg"
                  className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold px-8 shadow-lg shadow-accent/20"
                  onClick={() => setLocation("/tenders/new")}
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Post a Request
                </Button>
                <p className="text-xs text-muted-foreground">
                  Describe your project — receive proposals from qualified freelancers
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="container mx-auto max-w-5xl px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">
              Open Projects
              {!tendersLoading && tendersData?.total != null && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({tendersData.total})
                </span>
              )}
            </h2>

            {/* Inline action for buyer — compact version */}
            {isBuyer ? (
              <Button
                className="font-semibold bg-primary hover:bg-primary/90"
                onClick={() => setLocation("/tenders/new")}
              >
                <Plus className="mr-2 h-4 w-4" />
                Post a Tender
              </Button>
            ) : !isAuthenticated ? (
              <Button variant="outline" className="font-semibold" asChild>
                <Link href="/login?redirect=%2Ftenders%2Fnew">
                  <Briefcase className="mr-2 h-4 w-4" />
                  Post a Tender
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="space-y-4">
            {tendersLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))
            ) : tenders.length === 0 ? (
              <div className="py-16 text-center bg-muted/20 border border-dashed rounded-xl">
                <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium">No open tenders found</h3>
                <p className="text-muted-foreground mt-1">Check back later or adjust your search.</p>
                {isBuyer && (
                  <Button
                    className="mt-6 bg-primary hover:bg-primary/90"
                    onClick={() => setLocation("/tenders/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Be the first to post
                  </Button>
                )}
              </div>
            ) : (
              tenders.map((tender) => (
                <Card key={tender.id} className="hover-elevate transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="bg-primary/10 text-primary hover:bg-primary/20 rounded-sm"
                          >
                            {tender.categoryName}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {tender.createdAt
                              ? formatDistanceToNow(new Date(tender.createdAt), { addSuffix: true })
                              : "Recently"}
                          </span>
                        </div>

                        <Link href={`/tenders/${tender.id}`}>
                          <h3 className="text-xl font-bold leading-tight cursor-pointer hover:text-accent transition-colors">
                            {tender.title}
                          </h3>
                        </Link>

                        <p className="text-muted-foreground text-sm line-clamp-2 leading-relaxed">
                          {tender.description}
                        </p>

                        {tender.skills && tender.skills.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {tender.skills.slice(0, 5).map((skill) => (
                              <span
                                key={skill}
                                className="text-xs font-medium bg-muted px-2 py-1 rounded-md border text-muted-foreground"
                              >
                                {skill}
                              </span>
                            ))}
                            {tender.skills.length > 5 && (
                              <span className="text-xs font-medium bg-muted px-2 py-1 rounded-md border text-muted-foreground">
                                +{tender.skills.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 md:w-48 shrink-0 md:border-l pl-0 md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 mt-4 md:mt-0">
                        <div className="text-left md:text-right w-full">
                          <div className="text-sm text-muted-foreground font-medium mb-1">Budget</div>
                          <div className="text-2xl font-bold text-foreground">${tender.budget}</div>
                        </div>

                        <div className="w-full flex items-center justify-between md:justify-end gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span className="font-medium">{tender.proposalCount} proposals</span>
                        </div>

                        <Button
                          className="w-full mt-2 group bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          asChild
                        >
                          <Link href={`/tenders/${tender.id}`}>
                            View Details
                            <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </Layout>
    );
  }
  