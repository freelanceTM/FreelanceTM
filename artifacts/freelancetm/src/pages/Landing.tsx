import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useListFeaturedGigs, useGetMarketplaceStats, useListCategories } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/Layout";
import { Briefcase, Users, FileText, LayoutGrid, ArrowRight, Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Landing() {
  const { data: stats, isLoading: statsLoading } = useGetMarketplaceStats();
  const { data: featuredGigs, isLoading: gigsLoading } = useListFeaturedGigs();
  const { data: categories, isLoading: categoriesLoading } = useListCategories();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        {/* Hero Section */}
        <section className="bg-primary text-primary-foreground py-24 px-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-blue-900/50 mix-blend-multiply" />
          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
                  The <span className="text-accent">no-nonsense</span> freelance marketplace.
                </h1>
                <p className="text-lg md:text-xl text-primary-foreground/80 max-w-xl leading-relaxed">
                  Fast, dense, and precise. Connect with top-tier professionals for your next project without the clutter.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Input 
                      type="search" 
                      placeholder="What service are you looking for?" 
                      className="w-full h-12 pl-4 pr-12 text-foreground bg-background border-0 focus-visible:ring-accent"
                    />
                    <Button 
                      size="icon" 
                      className="absolute right-1 top-1 h-10 w-10 bg-accent text-accent-foreground hover:bg-accent/90"
                      onClick={() => setLocation('/catalog')}
                    >
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {!isAuthenticated && (
                  <div className="flex gap-4 pt-4">
                    <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90" asChild>
                      <Link href="/register">Join as Freelancer</Link>
                    </Button>
                    <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                      <Link href="/tenders">Post a Tender</Link>
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="hidden md:block">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-white/10 border-white/20 text-white backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <Briefcase className="h-8 w-8 text-accent mb-2" />
                      <CardTitle className="text-3xl font-bold">
                        {statsLoading ? <Skeleton className="h-8 w-16 bg-white/20" /> : stats?.totalGigs || 0}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Active Gigs</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-white/10 border-white/20 text-white backdrop-blur-sm translate-y-8">
                    <CardHeader className="pb-2">
                      <Users className="h-8 w-8 text-accent mb-2" />
                      <CardTitle className="text-3xl font-bold">
                        {statsLoading ? <Skeleton className="h-8 w-16 bg-white/20" /> : stats?.totalFreelancers || 0}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Professionals</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/10 border-white/20 text-white backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <FileText className="h-8 w-8 text-accent mb-2" />
                      <CardTitle className="text-3xl font-bold">
                        {statsLoading ? <Skeleton className="h-8 w-16 bg-white/20" /> : stats?.totalOrders || 0}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Completed Orders</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-white/10 border-white/20 text-white backdrop-blur-sm translate-y-8">
                    <CardHeader className="pb-2">
                      <LayoutGrid className="h-8 w-8 text-accent mb-2" />
                      <CardTitle className="text-3xl font-bold">
                        {statsLoading ? <Skeleton className="h-8 w-16 bg-white/20" /> : stats?.totalCategories || 0}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Categories</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Categories Section */}
        <section className="py-20 bg-muted/50 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl font-bold tracking-tight mb-2">Explore Categories</h2>
                <p className="text-muted-foreground">Browse through our most popular service categories.</p>
              </div>
              <Button variant="ghost" className="hidden sm:flex" asChild>
                <Link href="/catalog">View all <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {categoriesLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))
              ) : (
                categories?.slice(0, 10).map((category) => (
                  <Link key={category.id} href={`/catalog?category=${category.id}`}>
                    <Card className="h-full hover:border-accent hover:shadow-md transition-all cursor-pointer group">
                      <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-3">
                        <div className="p-3 rounded-full bg-primary/5 text-primary group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                          <LayoutGrid className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm line-clamp-2">{category.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{category.gigCount} gigs</p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Featured Gigs Section */}
        <section className="py-20 px-4 bg-background">
          <div className="container mx-auto max-w-6xl">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl font-bold tracking-tight mb-2">Featured Services</h2>
                <p className="text-muted-foreground">Top-rated gigs from our best freelancers.</p>
              </div>
              <Button variant="ghost" className="hidden sm:flex" asChild>
                <Link href="/catalog">Explore catalog <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {gigsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[300px] rounded-xl" />
                ))
              ) : (
                featuredGigs?.map((gig) => (
                  <Card key={gig.id} className="overflow-hidden flex flex-col hover-elevate border-border/50">
                    <div className="aspect-video bg-muted relative">
                      {gig.imageUrl ? (
                        <img src={gig.imageUrl} alt={gig.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                          <LayoutGrid className="h-10 w-10 opacity-20" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm text-foreground text-xs font-bold px-2 py-1 rounded shadow-sm">
                        ${gig.price}
                      </div>
                    </div>
                    <CardHeader className="p-4 pb-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <span className="truncate">{gig.categoryName}</span>
                        <span>•</span>
                        <div className="flex items-center text-accent">
                          <Star className="h-3 w-3 fill-current mr-1" />
                          <span className="font-medium text-foreground">{gig.rating?.toFixed(1) || "New"}</span>
                          <span className="text-muted-foreground ml-1">({gig.reviewCount})</span>
                        </div>
                      </div>
                      <CardTitle className="text-base leading-tight line-clamp-2 mb-2">
                        <Link href={`/catalog`} className="hover:text-primary transition-colors">
                          {gig.title}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardFooter className="p-4 pt-4 border-t border-border/50 flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {gig.sellerName.substring(0, 1).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium truncate max-w-[100px]">{gig.sellerName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{gig.deliveryDays}d delivery</span>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
