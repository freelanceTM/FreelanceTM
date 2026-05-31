import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/use-auth";
import { useListOrders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Clock, CheckCircle2, XCircle, AlertCircle, LayoutDashboard } from "lucide-react";
import { format } from "date-fns";

export default function Orders() {
  const { isAuthenticated, user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data: ordersData, isLoading } = useListOrders();

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center max-w-md">
          <LayoutDashboard className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-30" />
          <h1 className="text-2xl font-bold mb-2">My Orders</h1>
          <p className="text-muted-foreground mb-8">You need to log in to view your orders workspace.</p>
          <Button asChild className="w-full"><a href="/login">Log In</a></Button>
        </div>
      </Layout>
    );
  }

  const filteredOrders = ordersData?.items.filter(order => 
    statusFilter === "all" ? true : order.status === statusFilter
  ) || [];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "active": return { label: "Active", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Clock };
      case "delivered": return { label: "Delivered", color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: AlertCircle };
      case "completed": return { label: "Completed", color: "bg-green-500/10 text-green-600 border-green-200", icon: CheckCircle2 };
      case "revision": return { label: "In Revision", color: "bg-purple-500/10 text-purple-600 border-purple-200", icon: FileText };
      case "cancelled": return { label: "Cancelled", color: "bg-red-500/10 text-red-600 border-red-200", icon: XCircle };
      default: return { label: status, color: "bg-muted text-muted-foreground", icon: FileText };
    }
  };

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Orders Workspace</h1>
          <p className="text-muted-foreground mt-1">Manage your active contracts and order history.</p>
        </div>

        <Tabs defaultValue="all" onValueChange={setStatusFilter} className="w-full">
          <TabsList className="mb-6 w-full sm:w-auto overflow-x-auto justify-start inline-flex h-auto p-1 bg-muted/50 border">
            <TabsTrigger value="all" className="px-6 py-2">All Orders</TabsTrigger>
            <TabsTrigger value="active" className="px-6 py-2">Active</TabsTrigger>
            <TabsTrigger value="delivered" className="px-6 py-2">Delivered</TabsTrigger>
            <TabsTrigger value="completed" className="px-6 py-2">Completed</TabsTrigger>
            <TabsTrigger value="revision" className="px-6 py-2">Revision</TabsTrigger>
            <TabsTrigger value="cancelled" className="px-6 py-2">Cancelled</TabsTrigger>
          </TabsList>

          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            {/* Header row - desktop only */}
            <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b bg-muted/30 text-sm font-medium text-muted-foreground">
              <div className="col-span-5">Gig Title</div>
              <div className="col-span-2">Client / Freelancer</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            <div className="divide-y">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4 grid md:grid-cols-12 gap-4 items-center">
                    <Skeleton className="h-12 col-span-5 rounded-md" />
                    <Skeleton className="h-5 w-24 col-span-2 rounded-md" />
                    <Skeleton className="h-5 w-16 col-span-2 justify-self-end rounded-md" />
                    <Skeleton className="h-6 w-24 col-span-2 justify-self-center rounded-full" />
                    <Skeleton className="h-8 w-8 col-span-1 justify-self-end rounded-md" />
                  </div>
                ))
              ) : filteredOrders.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium">No orders found</p>
                  <p className="text-muted-foreground text-sm mt-1">There are no orders matching this status.</p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const status = getStatusConfig(order.status);
                  const StatusIcon = status.icon;
                  const isBuyer = user?.id === order.buyerId;
                  const counterpartName = isBuyer ? order.sellerName : order.buyerName;
                  const roleLabel = isBuyer ? "Freelancer" : "Buyer";

                  return (
                    <div key={order.id} className="p-4 grid md:grid-cols-12 gap-4 items-center hover:bg-muted/10 transition-colors">
                      <div className="col-span-12 md:col-span-5 flex gap-4 items-start md:items-center">
                        <div className="w-16 h-12 bg-muted rounded overflow-hidden shrink-0 hidden sm:block">
                          {order.gigImageUrl ? (
                            <img src={order.gigImageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary/50">
                              <FileText className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-sm line-clamp-2 mb-1 cursor-pointer hover:text-primary transition-colors">
                            {order.gigTitle}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <span>#{order.id}</span>
                            <span>•</span>
                            <span>{format(new Date(order.createdAt), "MMM d, yyyy")}</span>
                          </p>
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2 md:block flex justify-between items-center border-t md:border-0 pt-3 md:pt-0 mt-2 md:mt-0">
                        <span className="md:hidden text-xs text-muted-foreground">{roleLabel}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {counterpartName?.substring(0, 1).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium truncate">{counterpartName}</span>
                        </div>
                      </div>

                      <div className="col-span-6 md:col-span-2 text-right md:block flex justify-between items-center border-t md:border-0 pt-3 md:pt-0 mt-2 md:mt-0">
                        <span className="md:hidden text-xs text-muted-foreground">Price</span>
                        <span className="font-bold">${order.price}</span>
                      </div>

                      <div className="col-span-12 md:col-span-2 text-center flex items-center md:justify-center">
                        <Badge variant="outline" className={`py-1 px-2 border flex gap-1.5 w-max md:w-auto ${status.color}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {status.label}
                        </Badge>
                      </div>

                      <div className="col-span-12 md:col-span-1 text-right flex justify-end">
                        <Button variant="ghost" size="sm" className="w-full md:w-auto">
                          Details
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}
