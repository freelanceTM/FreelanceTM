import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import {
  useListOrders,
  useUpdateOrderStatus,
  getListOrdersQueryKey,
  type OrderStatusUpdateStatus,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  PackageCheck,
  RefreshCw,
  ChevronRight,
  LayoutDashboard,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: {
    label: "Active",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: Clock,
  },
  delivered: {
    label: "Delivered",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    icon: PackageCheck,
  },
  completed: {
    label: "Completed",
    color: "bg-green-500/10 text-green-400 border-green-500/20",
    icon: CheckCircle2,
  },
  revision: {
    label: "Revision Requested",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    icon: RefreshCw,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: XCircle,
  },
};

const STATUS_TABS = ["all", "active", "delivered", "revision", "completed", "cancelled"];

export default function Orders() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");

  const [deliverOrderId, setDeliverOrderId] = useState<number | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");

  const [revisionOrderId, setRevisionOrderId] = useState<number | null>(null);
  const [revisionNote, setRevisionNote] = useState("");

  const { data: ordersRaw, isLoading } = useListOrders();
  const orders: any[] = (ordersRaw as any)?.items ?? (Array.isArray(ordersRaw) ? ordersRaw : []);

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: (_, vars) => {
        const msgs: Record<string, string> = {
          delivered: "Work delivered! Awaiting client review.",
          completed: "Order completed — funds released.",
          revision: "Revision requested. The freelancer has been notified.",
          cancelled: "Order cancelled.",
        };
        toast({ title: msgs[vars.data.status] ?? "Status updated." });
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setDeliverOrderId(null);
        setRevisionOrderId(null);
        setDeliveryMessage("");
        setDeliveryUrl("");
        setRevisionNote("");
      },
      onError: () =>
        toast({ title: "Failed to update order status.", variant: "destructive" }),
    },
  });

  const filteredOrders =
    statusFilter === "all" ? orders : orders.filter((o: any) => o.status === statusFilter);

  const handleDeliver = () => {
    if (!deliverOrderId || !deliveryMessage.trim()) return;
    const note = deliveryUrl.trim()
      ? `${deliveryMessage.trim()}\n\nDelivery URL: ${deliveryUrl.trim()}`
      : deliveryMessage.trim();
    updateStatus.mutate({
      orderId: deliverOrderId,
      data: { status: "delivered" as OrderStatusUpdateStatus, note },
    });
  };

  const handleRevision = () => {
    if (!revisionOrderId || !revisionNote.trim()) return;
    updateStatus.mutate({
      orderId: revisionOrderId,
      data: { status: "revision" as OrderStatusUpdateStatus, note: revisionNote.trim() },
    });
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center max-w-md">
          <LayoutDashboard className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-20" />
          <h1 className="text-2xl font-bold mb-2">My Orders</h1>
          <p className="text-muted-foreground mb-8">
            Log in to view and manage your orders.
          </p>
          <Button asChild className="w-full">
            <Link href="/login">Log In</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your active contracts and order history.
          </p>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-5">
          <TabsList className="bg-white/5 border border-white/10 h-auto p-1 flex-wrap gap-0.5 w-full sm:w-auto">
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s} className="text-xs px-3 py-1.5 capitalize">
                {s === "all"
                  ? "All"
                  : s === "revision"
                  ? "Revision"
                  : STATUS_CONFIG[s]?.label ?? s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl bg-white/5" />
            ))
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <FileText className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-muted-foreground">No orders here yet.</p>
            </div>
          ) : (
            filteredOrders.map((order: any) => {
              const cfg = STATUS_CONFIG[order.status] ?? {
                label: order.status,
                color: "bg-white/5 text-muted-foreground border-white/10",
                icon: AlertCircle,
              };
              const StatusIcon = cfg.icon;
              const isBuyer = user?.id === order.buyerId;
              const isSeller = user?.id === order.sellerId;
              const canDeliver =
                isSeller && (order.status === "active" || order.status === "revision");
              const canComplete = isBuyer && order.status === "delivered";
              const canRevision = isBuyer && order.status === "delivered";

              return (
                <div
                  key={order.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                      {order.gigImageUrl ? (
                        <img
                          src={order.gigImageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={`text-xs px-2 py-0.5 border flex items-center gap-1 ${cfg.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          #{order.id}
                        </span>
                      </div>

                      <p className="font-semibold text-sm mb-1 line-clamp-1">
                        {order.gigTitle ?? "Contract"}
                      </p>

                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {isBuyer
                            ? `Freelancer: ${order.sellerName}`
                            : `Client: ${order.buyerName}`}
                        </span>
                        <span className="font-semibold text-foreground">${order.price}</span>
                        <span>
                          {format(new Date(order.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>

                      {order.deliveryNote && (
                        <div
                          className={`mt-2 p-2.5 rounded-lg text-xs leading-relaxed ${
                            order.status === "revision"
                              ? "bg-purple-500/5 border border-purple-500/20 text-purple-300"
                              : "bg-green-500/5 border border-green-500/20 text-green-300"
                          }`}
                        >
                          <span className="font-semibold">
                            {order.status === "revision"
                              ? "Revision note: "
                              : "Delivery message: "}
                          </span>
                          {order.deliveryNote}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-col sm:items-end">
                      {canDeliver && (
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            setDeliverOrderId(order.id);
                            setDeliveryMessage("");
                            setDeliveryUrl("");
                          }}
                          disabled={updateStatus.isPending}
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Deliver Work
                        </Button>
                      )}
                      {canComplete && (
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white border-0"
                          onClick={() =>
                            updateStatus.mutate({
                              orderId: order.id,
                              data: { status: "completed" as OrderStatusUpdateStatus },
                            })
                          }
                          disabled={updateStatus.isPending}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Accept &amp; Complete
                        </Button>
                      )}
                      {canRevision && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                          onClick={() => {
                            setRevisionOrderId(order.id);
                            setRevisionNote("");
                          }}
                          disabled={updateStatus.isPending}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Request Revision
                        </Button>
                      )}
                      <Link href={`/orders/${order.id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
                        >
                          Details
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Deliver Work Dialog */}
      <Dialog
        open={deliverOrderId !== null}
        onOpenChange={(open) => !open && setDeliverOrderId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-primary" />
              Deliver Work
            </DialogTitle>
            <DialogDescription>
              Describe what you've completed and provide any relevant links. The client
              will review your delivery before accepting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="delivery-message">
                Delivery Message <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="delivery-message"
                placeholder="Describe what you've delivered, key features, usage instructions, or anything the client should know..."
                value={deliveryMessage}
                onChange={(e) => setDeliveryMessage(e.target.value)}
                rows={4}
                className="bg-white/5 border-white/10 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery-url">Delivery Link (optional)</Label>
              <Input
                id="delivery-url"
                type="url"
                placeholder="https://github.com/... or Google Drive link"
                value={deliveryUrl}
                onChange={(e) => setDeliveryUrl(e.target.value)}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 border-white/10"
                onClick={() => setDeliverOrderId(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleDeliver}
                disabled={!deliveryMessage.trim() || updateStatus.isPending}
              >
                <PackageCheck className="w-4 h-4" />
                {updateStatus.isPending ? "Submitting..." : "Submit Delivery"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request Revision Dialog */}
      <Dialog
        open={revisionOrderId !== null}
        onOpenChange={(open) => !open && setRevisionOrderId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-purple-400" />
              Request Revision
            </DialogTitle>
            <DialogDescription>
              Explain clearly what changes are needed. The freelancer will re-deliver
              once revisions are complete.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="revision-note">
                Revision Note <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="revision-note"
                placeholder="What's missing or needs to be changed? Be as specific as possible so the freelancer can address every point..."
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                rows={4}
                className="bg-white/5 border-white/10 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 border-white/10"
                onClick={() => setRevisionOrderId(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 border-0"
                onClick={handleRevision}
                disabled={!revisionNote.trim() || updateStatus.isPending}
              >
                <RefreshCw className="w-4 h-4" />
                {updateStatus.isPending ? "Requesting..." : "Request Revision"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
