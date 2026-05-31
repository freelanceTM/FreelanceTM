import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useGetMyBids } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  Clock,
  DollarSign,
  FileText,
  CheckCircle2,
  Trophy,
  Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function BidStatusBadge({ isSelected, tenderStatus }: { isSelected: boolean; tenderStatus: string }) {
  if (isSelected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
        <Trophy className="h-3 w-3" /> Accepted
      </span>
    );
  }
  if (tenderStatus === "in_progress" || tenderStatus === "closed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-200">
        Not Selected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-200">
      <Clock className="h-3 w-3" /> Pending Review
    </span>
  );
}

export default function MyBids() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError } = useGetMyBids({ query: { enabled: isAuthenticated } });

  const bids = data?.items ?? [];

  return (
    <Layout>
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-extrabold tracking-tight">My Proposals</h1>
          </div>
          <p className="text-muted-foreground">
            Track the bids you&apos;ve submitted to client projects.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Failed to load your proposals. Please refresh.</p>
          </div>
        ) : bids.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed bg-muted/30 p-16 text-center">
            <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h2 className="text-xl font-bold mb-2">No proposals yet</h2>
            <p className="text-muted-foreground mb-6">
              Browse the exchange and submit your first bid on a project that matches your skills.
            </p>
            <Button asChild>
              <Link href="/tenders">Browse Projects</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => (
              <Card key={bid.id} className={`border transition-colors hover:border-primary/30 ${bid.isSelected ? "border-emerald-500/30 bg-emerald-500/3" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Tender title + category */}
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        {bid.categoryName && (
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary rounded-sm">
                            {bid.categoryName}
                          </Badge>
                        )}
                        <BidStatusBadge isSelected={bid.isSelected} tenderStatus={bid.tenderStatus} />
                      </div>
                      <h3 className="font-bold text-base leading-snug mb-1 truncate">
                        {bid.tenderTitle}
                      </h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Posted by {bid.buyerName} ·{" "}
                        {bid.createdAt
                          ? `Bid placed ${formatDistanceToNow(new Date(bid.createdAt), { addSuffix: true })}`
                          : ""}
                      </p>

                      {/* Bid details row */}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 font-semibold">
                          <DollarSign className="h-4 w-4 text-primary" />
                          {bid.price.toLocaleString()} your bid
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {bid.deliveryDays} days delivery
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">
                          Budget: ${bid.tenderBudget.toLocaleString()}
                        </span>
                      </div>

                      {bid.isSelected && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600 font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          Your proposal was accepted — project is now in progress!
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">
                      <Button variant="outline" size="sm" asChild className="gap-1">
                        <Link href={`/tenders/${bid.tenderId}`}>
                          View Tender
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
