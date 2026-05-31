import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useGetProfile, useGetWallet } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Calendar, Star, Shield, Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, User, Briefcase } from "lucide-react";
import { format } from "date-fns";

export default function Profile() {
  const { isAuthenticated, user: authUser } = useAuth();
  
  // We use query options enabled: !!isAuthenticated so it doesn't fire if logged out.
  // The API mock hooks might still return data if configured loosely.
  const { data: profile, isLoading: profileLoading } = useGetProfile({
    query: { enabled: isAuthenticated }
  });
  
  const { data: wallet, isLoading: walletLoading } = useGetWallet({
    query: { enabled: isAuthenticated }
  });

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center max-w-md">
          <User className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-30" />
          <h1 className="text-2xl font-bold mb-2">Profile</h1>
          <p className="text-muted-foreground mb-8">You need to log in to view your profile.</p>
          <Button asChild className="w-full"><a href="/login">Log In</a></Button>
        </div>
      </Layout>
    );
  }

  const displayUser = profile || authUser;

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Left Column - User Info */}
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-primary/80 to-accent/80"></div>
              <CardContent className="px-6 pb-6 pt-0 relative">
                <div className="flex justify-between items-end mb-4">
                  <Avatar className="h-24 w-24 border-4 border-background -mt-12 bg-background">
                    <AvatarImage src={displayUser?.avatarUrl || undefined} />
                    <AvatarFallback className="text-3xl font-bold">
                      {displayUser?.username?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Badge variant="outline" className="capitalize bg-background font-semibold">
                    {displayUser?.role}
                  </Badge>
                </div>
                
                <div className="space-y-1 mb-6">
                  <h1 className="text-2xl font-bold leading-tight">{displayUser?.displayName || displayUser?.username}</h1>
                  <p className="text-muted-foreground">@{displayUser?.username}</p>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                  {displayUser?.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" /> {displayUser.location}
                    </span>
                  )}
                  {displayUser?.memberSince && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" /> Joined {format(new Date(displayUser.memberSince), "MMM yyyy")}
                    </span>
                  )}
                </div>

                {displayUser?.role === "freelancer" && (
                  <div className="grid grid-cols-2 gap-4 py-4 border-y mb-6">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 uppercase font-medium tracking-wider">Rating</div>
                      <div className="flex items-center gap-1 font-bold text-lg">
                        <Star className="h-5 w-5 fill-accent text-accent" />
                        {displayUser.rating?.toFixed(1) || "New"}
                        <span className="text-sm font-normal text-muted-foreground">({displayUser.reviewCount})</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 uppercase font-medium tracking-wider">Orders</div>
                      <div className="flex items-center gap-1 font-bold text-lg">
                        <Shield className="h-5 w-5 text-primary" />
                        {displayUser.completedOrders || 0}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">About</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {displayUser?.bio || "No bio provided."}
                    </p>
                  </div>

                  {displayUser?.skills && displayUser.skills.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {displayUser.skills.map(skill => (
                          <Badge key={skill} variant="secondary" className="bg-muted hover:bg-muted font-normal text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button className="w-full mt-8" variant="outline">Edit Profile</Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Wallet & Content */}
          <div className="md:col-span-2 space-y-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <WalletIcon className="h-5 w-5 text-accent" /> Wallet Balance
                  </CardTitle>
                  <CardDescription>Manage your funds and transactions</CardDescription>
                </div>
                <div className="text-right">
                  {walletLoading ? (
                    <Skeleton className="h-8 w-24 ml-auto" />
                  ) : (
                    <div className="text-3xl font-bold tracking-tight">
                      ${wallet?.balance?.toFixed(2) || "0.00"}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="px-6 py-4 flex gap-3 border-b bg-muted/10">
                  <Button className="flex-1 bg-primary">Withdraw Funds</Button>
                  <Button className="flex-1 bg-secondary text-secondary-foreground">Add Funds</Button>
                </div>
                
                <div className="p-6">
                  <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Recent Transactions</h3>
                  
                  {walletLoading ? (
                    <div className="space-y-4">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : wallet?.transactions && wallet.transactions.length > 0 ? (
                    <div className="space-y-4">
                      {wallet.transactions.map((tx) => (
                        <div key={tx.id} className="flex justify-between items-center p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${tx.type === 'credit' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                              {tx.type === 'credit' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{tx.description}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), "MMM d, yyyy h:mm a")}</p>
                            </div>
                          </div>
                          <div className={`font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-foreground'}`}>
                            {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/20">
                      No recent transactions
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Empty state for Portfolio/Gigs depending on role */}
            <Card className="border-border/50 shadow-sm border-dashed bg-muted/20">
              <CardContent className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                  <Briefcase className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">
                  {displayUser?.role === 'freelancer' ? 'No Gigs Created' : 'No Tenders Posted'}
                </h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                  {displayUser?.role === 'freelancer' 
                    ? 'Start offering your services by creating your first gig.'
                    : 'Looking for professionals? Post a tender to receive proposals.'}
                </p>
                <Button>
                  {displayUser?.role === 'freelancer' ? 'Create a Gig' : 'Post a Tender'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
