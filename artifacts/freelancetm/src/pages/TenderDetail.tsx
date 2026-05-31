import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetTender,
  useCreateTenderBid,
  useGetTenderBids,
  useSelectTenderBid,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Clock,
  Users,
  DollarSign,
  CalendarDays,
  Loader2,
  CheckCircle2,
  SendHorizonal,
  AlertCircle,
  Trophy,
  MessageSquare,
  Briefcase,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const bidSchema = z.object({
  price: z
    .number({ invalid_type_error: "Please enter a valid amount" })
    .positive("Bid must be greater than 0")
    .max(1_000_000, "Bid exceeds maximum"),
  deliveryDays: z
    .number({ invalid_type_error: "Please enter a number" })
    .int()
    .positive("Delivery days must be at least 1")
    .max(365),
  message: z
    .string()
    .min(20, "Cover letter must be at least 20 characters")
    .max(2000, "Cover letter is too long"),
});

type BidFormValues = z.infer<typeof bidSchema>;

export default function TenderDetail() {
  const { id } = useParams<{ id: string }>();
  const tenderId = parseInt(id ?? "0", 10);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [acceptingBidId, setAcceptingBidId] = useState<number | null>(null);

  const { data: tender, isLoading, isError, refetch: refetchTender } = useGetTender(tenderId, {
    query: { enabled: tenderId > 0 },
  });

  const userId = (user as { id?: number } | null)?.id;
  const isOwner = !!(userId && tender && tender.buyerId === userId);
  const role = (user as { role?: string } | null)?.role ?? "";
  const canBid = isAuthenticated && (role === "freelancer" || role === "both") && !isOwner;
  const isBuyer = isAuthenticated && (role === "buyer" || role === "client" || role === "both") && !isOwner;

  const { data: bidsData, isLoading: bidsLoading, refetch: refetchBids } = useGetTenderBids(tenderId, {
    query: { enabled: isOwner && tenderId > 0 },
  });

  const bidMutation = useCreateTenderBid();
  const selectBidMutation = useSelectTenderBid();

  const form = useForm<BidFormValues>({
    resolver: zodResolver(bidSchema),
    defaultValues: {
      price: undefined as unknown as number,
      deliveryDays: undefined as unknown as number,
      message: "",
    },
  });

  function onSubmit(values: BidFormValues) {
    bidMutation.mutate(
      {
        id: tenderId,
        data: {
          price: values.price,
          deliveryDays: values.deliveryDays,
          message: values.message,
        },
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          setOpen(false);
          toast({
            title: "Proposal submitted!",
            description: "The buyer will review your bid and get back to you.",
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Failed to submit proposal",
            description: "Please check your details and try again.",
          });
        },
      }
    );
  }

  function handleAcceptBid(bidId: number) {
    setAcceptingBidId(bidId);
    selectBidMutation.mutate(
      { tenderId, bidId },
      {
        onSuccess: () => {
          toast({
            title: "Proposal accepted!",
            description: "The project is now in progress. Redirecting to your workspace…",
          });
          refetchTender();
          refetchBids();
          setTimeout(() => setLocation("/orders"), 1500);
        },
        onError: (err: unknown) => {
          setAcceptingBidId(null);
          const msg = (err as { message?: string })?.message ?? "Please try again.";
          toast({
            variant: "destructive",
            title: "Failed to accept proposal",
            description: msg,
          });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="bg-muted/30 border-b">
          <div className="container mx-auto max-w-4xl px-4 py-10 space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="container mx-auto max-w-4xl px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !tender) {
    return (
      <Layout>
        <div className="container mx-auto max-w-4xl px-4 py-24 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h1 className="text-2xl font-bold mb-3">Tender not found</h1>
          <p className="text-muted-foreground mb-6">
            This project may have been removed or doesn&apos;t exist.
          </p>
          <Button asChild>
            <Link href="/tenders">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Exchange
            </Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    closed: { label: "Closed", className: "bg-muted text-muted-foreground border-border" },
  };
  const statusInfo = statusConfig[tender.status] ?? statusConfig.closed;
  const bids = bidsData?.items ?? [];

  return (
    <Layout>
      {/* Page header */}
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto max-w-4xl px-4 py-10">
          <Button
            variant="ghost"
            asChild
            className="text-muted-foreground hover:text-foreground mb-4 -ml-2"
          >
            <Link href="/tenders">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Exchange
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between">
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap gap-2 items-center">
                {tender.categoryName && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary rounded-sm hover:bg-primary/20">
                    {tender.categoryName}
                  </Badge>
                )}
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusInfo.className}`}>
                  {statusInfo.label}
                </span>
                {isOwner && (
                  <Badge variant="outline" className="text-xs border-dashed">
                    Your Tender
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight leading-tight">{tender.title}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                Posted{" "}
                {tender.createdAt
                  ? formatDistanceToNow(new Date(tender.createdAt), { addSuffix: true })
                  : "recently"}
              </p>
            </div>
            <div className="shrink-0 md:text-right">
              <div className="text-3xl font-extrabold text-foreground">
                ${tender.budget.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">Budget</div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h2 className="text-lg font-bold mb-3">Project Description</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {tender.description}
              </p>
            </div>

            {tender.skills && tender.skills.length > 0 && (
              <div>
                <h2 className="text-lg font-bold mb-3">Required Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {tender.skills.map((skill) => (
                    <span
                      key={skill}
                      className="text-sm font-medium bg-muted px-3 py-1.5 rounded-md border text-muted-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {tender.deadline && (
              <div>
                <h2 className="text-lg font-bold mb-3">Deadline</h2>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span>{format(new Date(tender.deadline), "MMMM d, yyyy")}</span>
                </div>
              </div>
            )}

            {/* ── BUYER VIEW: Received Proposals ─────────────────────── */}
            {isOwner && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Received Proposals
                    {bids.length > 0 && (
                      <span className="ml-1 text-sm font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {bids.length}
                      </span>
                    )}
                  </h2>
                </div>

                {bidsLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-36 w-full rounded-xl" />
                    ))}
                  </div>
                ) : bids.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed bg-muted/30 p-10 text-center">
                    <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="font-semibold text-muted-foreground">No proposals yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Freelancers will submit bids once they see your listing.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bids.map((bid) => {
                      const isAccepted = bid.isSelected;
                      const isAccepting = acceptingBidId === bid.id && selectBidMutation.isPending;

                      return (
                        <Card
                          key={bid.id}
                          className={`border transition-colors ${
                            isAccepted
                              ? "border-emerald-500/40 bg-emerald-500/5"
                              : "hover:border-primary/30"
                          }`}
                        >
                          <CardContent className="p-5">
                            <div className="flex gap-4">
                              <Avatar className="h-11 w-11 shrink-0">
                                <AvatarImage src={bid.freelancerAvatarUrl ?? undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                                  {(bid.freelancerName ?? "?")[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                  <div>
                                    <span className="font-semibold">{bid.freelancerName}</span>
                                    {bid.freelancerRating && (
                                      <span className="ml-2 text-xs text-amber-600">
                                        ★ {Number(bid.freelancerRating).toFixed(1)}
                                      </span>
                                    )}
                                    {isAccepted && (
                                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
                                    <span className="flex items-center gap-1 font-bold text-foreground">
                                      <DollarSign className="h-4 w-4 text-primary" />
                                      {bid.price.toLocaleString()}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-4 w-4" />
                                      {bid.deliveryDays}d
                                    </span>
                                  </div>
                                </div>

                                {bid.message && (
                                  <div className="flex gap-2 mb-3">
                                    <MessageSquare className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                                      {bid.message}
                                    </p>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {bid.createdAt
                                      ? formatDistanceToNow(new Date(bid.createdAt), { addSuffix: true })
                                      : ""}
                                  </span>
                                  {!isAccepted && tender.status === "open" && (
                                    <Button
                                      size="sm"
                                      className="bg-primary hover:bg-primary/90 font-semibold gap-1.5"
                                      onClick={() => handleAcceptBid(bid.id)}
                                      disabled={selectBidMutation.isPending}
                                    >
                                      {isAccepting ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          Accepting…
                                        </>
                                      ) : (
                                        <>
                                          <Trophy className="h-3.5 w-3.5" />
                                          Accept Proposal
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Buyer card */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Posted by
              </h3>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={tender.buyerAvatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {(tender.buyerName ?? "?")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold leading-none">{tender.buyerName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Client</p>
                </div>
              </div>
            </div>

            {/* Stats card */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" /> Proposals
                </span>
                <span className="font-bold">{tender.proposalCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Budget
                </span>
                <span className="font-bold">${tender.budget.toLocaleString()}</span>
              </div>
            </div>

            {/* CTA — only for non-owners */}
            {isOwner ? (
              <div className="rounded-xl border bg-muted/40 p-4 text-center">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You are the author of this tender. Review proposals above and accept the best one.
                </p>
              </div>
            ) : submitted ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Proposal Submitted!
                </p>
                <p className="text-xs text-muted-foreground">
                  The buyer will review your bid and reach out.
                </p>
              </div>
            ) : !isAuthenticated ? (
              <Button
                className="w-full font-bold h-11"
                onClick={() => setLocation(`/login?redirect=/tenders/${tenderId}`)}
              >
                <SendHorizonal className="mr-2 h-4 w-4" />
                Login to Submit Proposal
              </Button>
            ) : canBid && tender.status === "open" ? (
              <Button
                className="w-full font-bold h-11 bg-primary hover:bg-primary/90"
                onClick={() => setOpen(true)}
              >
                <SendHorizonal className="mr-2 h-4 w-4" />
                Submit Proposal
              </Button>
            ) : isBuyer && tender.status === "open" ? (
              <p className="text-xs text-center text-muted-foreground bg-muted rounded-lg p-3 leading-relaxed">
                You posted this tender as a client. Freelancers will submit proposals here.
              </p>
            ) : tender.status !== "open" ? (
              <p className="text-xs text-center text-muted-foreground bg-muted rounded-lg p-3">
                This tender is no longer accepting proposals.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Proposal modal — freelancers only */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Your Proposal</DialogTitle>
            <DialogDescription>
              Provide your bid details for &ldquo;{tender.title}&rdquo;
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bid Price (USD)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            placeholder="500"
                            className="pl-9"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              field.onChange(v === "" ? undefined : parseFloat(v));
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery (days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          placeholder="14"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === "" ? undefined : parseInt(v, 10));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cover Letter</FormLabel>
                    <FormDescription>
                      Explain why you&apos;re the right person for this project.
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your relevant experience, approach to this project, and why you're a great fit..."
                        rows={5}
                        className="resize-none leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <div className="flex justify-end">
                      <span className="text-xs text-muted-foreground">
                        {field.value?.length ?? 0}/2000
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setOpen(false)}
                  disabled={bidMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 font-bold bg-primary hover:bg-primary/90"
                  disabled={bidMutation.isPending}
                >
                  {bidMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      <SendHorizonal className="mr-2 h-4 w-4" /> Send Proposal
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
