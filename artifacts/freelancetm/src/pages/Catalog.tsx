import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, Star, Filter, LayoutGrid, ArrowRight } from "lucide-react";
import { useListGigs, useListCategories } from "@workspace/api-client-react";

export default function Catalog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  
  const { data: categories, isLoading: categoriesLoading } = useListCategories();
  const { data: gigsData, isLoading: gigsLoading } = useListGigs({
    search: searchQuery || undefined,
    categoryId: activeCategory || undefined,
  });

  return (
    <Layout>
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
            <p className="text-muted-foreground mt-1">Browse and find the perfect service for your project.</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search gigs..." 
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Filters */}
          <aside className="space-y-6">
            <div className="bg-card border rounded-lg p-5">
              <div className="flex items-center gap-2 font-semibold mb-4 border-b pb-3">
                <Filter className="h-4 w-4" />
                <span>Filters</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-3">Categories</h3>
                  {categoriesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="cat-all" 
                          checked={activeCategory === null}
                          onCheckedChange={() => setActiveCategory(null)}
                        />
                        <Label htmlFor="cat-all" className="text-sm font-normal cursor-pointer">All Categories</Label>
                      </div>
                      {categories?.map((cat) => (
                        <div key={cat.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`cat-${cat.id}`} 
                            checked={activeCategory === cat.id}
                            onCheckedChange={() => setActiveCategory(cat.id)}
                          />
                          <Label htmlFor={`cat-${cat.id}`} className="text-sm font-normal cursor-pointer flex-1 flex justify-between">
                            <span className="truncate pr-2">{cat.name}</span>
                            <span className="text-muted-foreground text-xs">{cat.gigCount}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3">Price Range</h3>
                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="Min" className="h-8" />
                    <span className="text-muted-foreground">-</span>
                    <Input type="number" placeholder="Max" className="h-8" />
                  </div>
                  <Button className="w-full mt-3 h-8" size="sm" variant="secondary">Apply</Button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="mb-4 flex justify-between items-center text-sm text-muted-foreground">
              <span>{gigsData?.total || 0} gigs found</span>
              <div className="flex items-center gap-2">
                <span>Sort by:</span>
                <select className="bg-transparent border-0 font-medium text-foreground focus:ring-0 cursor-pointer">
                  <option>Recommended</option>
                  <option>Newest Arrivals</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {gigsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[320px] rounded-xl" />
                ))
              ) : gigsData?.items.length === 0 ? (
                <div className="col-span-full py-12 text-center bg-muted/30 rounded-xl border border-dashed">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-1">No gigs found</h3>
                  <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
                  <Button variant="outline" className="mt-4" onClick={() => {setSearchQuery(""); setActiveCategory(null);}}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                gigsData?.items.map((gig) => (
                  <Card key={gig.id} className="overflow-hidden flex flex-col hover-elevate transition-shadow border-border/60">
                    <div className="aspect-[4/3] bg-muted relative group">
                      {gig.imageUrl ? (
                        <img src={gig.imageUrl} alt={gig.title} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                          <LayoutGrid className="h-10 w-10 opacity-20" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-background/95 backdrop-blur-md text-foreground font-bold px-2.5 py-1 rounded-md shadow-sm border border-border/50 text-sm">
                        ${gig.price}
                      </div>
                    </div>
                    <CardHeader className="p-4 pb-2 flex-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span className="truncate bg-muted px-2 py-0.5 rounded-sm">{gig.categoryName}</span>
                        <div className="flex items-center text-accent">
                          <Star className="h-3.5 w-3.5 fill-current mr-1" />
                          <span className="font-semibold text-foreground">{gig.rating?.toFixed(1) || "New"}</span>
                          <span className="text-muted-foreground ml-1">({gig.reviewCount})</span>
                        </div>
                      </div>
                      <CardTitle className="text-base leading-snug line-clamp-2 hover:text-primary cursor-pointer transition-colors">
                        {gig.title}
                      </CardTitle>
                    </CardHeader>
                    <CardFooter className="p-4 pt-3 border-t bg-muted/10 flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2 cursor-pointer group">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          {gig.sellerName.substring(0, 1).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium truncate max-w-[120px] group-hover:text-primary transition-colors">{gig.sellerName}</span>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{gig.deliveryDays} days</span>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>

            {/* Pagination Placeholder */}
            {gigsData?.total ? gigsData.total > (gigsData.limit || 12) && (
              <div className="mt-10 flex justify-center">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                  <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">1</Button>
                  <Button variant="outline" size="sm">2</Button>
                  <Button variant="outline" size="sm">3</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
}
