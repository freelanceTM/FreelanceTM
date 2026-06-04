import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useI18n } from "@/lib/i18n";
import {
  getGetOrderQueryKey,
  getListMessagesQueryKey,
  useGetOrder,
  useListMessages,
  useSendMessage,
  useUpdateOrderStatus,
  useCreateReview,
  type OrderStatusUpdateStatus,
} from "@workspace/api-client-react";
import {
  CheckCircle, XCircle, Clock, MessageSquare, Send,
  ShieldAlert, RefreshCw, AlertTriangle, Star, PackageCheck,
  Wifi, WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getErrorToast } from "@/lib/api-error";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function OrderDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id);
  const { t } = useI18n();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [message, setMessage] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [showDeliverDialog, setShowDeliverDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [hoverRating, setHoverRating] = useState(0);
  const [disputeLoading, setDisputeLoading] = useState(false);

  // Socket.IO for real-time chat
  const { connected, lastMessage, sendMessage: sendSocketMessage, markRead } = useSocket(id);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: order, isLoading: orderLoading } = useGetOrder(id, {
    query: {
      enabled: !!id && !!user,
      queryKey: getGetOrderQueryKey(id),
      refetchInterval: connected ? false : 10000, // poll only when socket offline
    },
  });

  const { data: messages, isLoading: messagesLoading } = useListMessages(id, {
    query: {
      enabled: !!id && !!user,
      queryKey: getListMessagesQueryKey(id),
      refetchInterval: connected ? false : 5000,
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, lastMessage]);

  // Mark messages as read when chat is visible
  useEffect(() => {
    if (id && user) {
      markRead();
      // Also REST fallback
      fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/messages/order/${id}/read`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || ""}`,
        },
      }).catch(() => {});
    }
  }, [id, user, markRead]);

  // Handle incoming socket messages
  const [liveMessages, setLiveMessages] = useState<any[]>([]);
  useEffect(() => {
    if (lastMessage?.type === "new") {
      setLiveMessages((prev) => [...prev, lastMessage.data]);
      // Auto mark read if we're in the chat
      markRead();
    }
    if (lastMessage?.type === "read") {
      // Could update UI to show read receipts
    }
  }, [lastMessage, markRead]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListMessagesQueryKey(id) });
  };

  const sendMessageRest = useSendMessage({
    mutation: {
      onSuccess: () => {
        setMessage("");
        invalidate();
      },
    },
  });

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: (data) => {
        toast({ title: statusToastMsg(data.status) });
        invalidate();
      },

    },
  });

  const createReview = useCreateReview({
    mutation: {
      onSuccess: () => {
        toast({ title: "Отзыв опубликован! Спасибо 🎉" });
        setShowReviewDialog(false);
        invalidate();
      },

    },
  });

  const statusToastMsg = (s: string) => {
    const map: Record<string, string> = {
      active: "Заказ принят в работу",
      cancelled: "Заказ отменён",
      delivered: "Работа сдана покупателю",
      completed: "Заказ завершён",
      revision: "Запрошена правка — исполнитель уведомлён",
    };
    return map[s] ?? "Статус обновлён";
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (connected) {
      sendSocketMessage(message);
      setMessage("");
      // Optimistically add to liveMessages
      setLiveMessages((prev) => [
        ...prev,
        {
          id: `optimistic_${Date.now()}`,
          senderId: user?.id,
          content: message,
          createdAt: new Date().toISOString(),
          sender: { id: user?.id, username: user?.username, displayName: user?.displayName, avatarUrl: user?.avatarUrl },
        },
      ]);
    } else {
      sendMessageRest.mutate({ orderId: id, data: { content: message } });
    }
  };

  const handleStatus = (newStatus: OrderStatusUpdateStatus, note?: string) => {
    updateStatus.mutate({ orderId: id, data: { status: newStatus, note } });
  };

  const handleDeliver = (e: React.FormEvent) => {
    e.preventDefault();
    const note = deliveryNote.trim() || undefined;
    if (note) {
      if (connected) {
        sendSocketMessage(`📦 Работа сдана:\n\n${note}`);
      } else {
        sendMessageRest.mutate({ orderId: id, data: { content: `📦 Работа сдана:\n\n${note}` } });
      }
    }
    handleStatus("delivered", note);
    setShowDeliverDialog(false);
    setDeliveryNote("");
  };

  const handleRevision = (e: React.FormEvent) => {
    e.preventDefault();
    const note = revisionNote.trim() || undefined;
    handleStatus("revision" as OrderStatusUpdateStatus, note);
    setShowRevisionDialog(false);
    setRevisionNote("");
  };

  const handleDispute = async () => {
    const tok = JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";
    setDisputeLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/orders/${id}/dispute`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Ошибка");
      toast({ title: "Спор открыт", description: "Администратор рассмотрит ситуацию и примет решение." });
      invalidate();
    } catch (err: unknown) {
      const { title, description } = getErrorToast(err);
      toast({ title, description, variant: "destructive" });
    } finally {
      setDisputeLoading(false);
    }
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    createReview.mutate({
      data: {
        gigId: order.gigId,
        orderId: order.id,
        rating: reviewRating,
        comment: reviewComment || undefined,
      },
    });
  };

  // Merge REST messages + live socket messages
  const allMessages = [...(messages || []), ...liveMessages];
  // Deduplicate by id
  const uniqueMessages = allMessages.filter(
    (msg, idx, arr) => arr.findIndex((m) => m.id === msg.id) === idx
  );
  uniqueMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (authLoading || orderLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-[600px] w-full bg-white/5 rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!order)
    return (
      <Layout>
        <div className="p-20 text-center text-muted-foreground">Заказ не найден</div>
      </Layout>
    );

  const isSeller = user?.id === order.sellerId;
  const isBuyer = user?.id === order.buyerId;

  const statusFlow = [
    { key: "pending", label: "Ожидает" },
    { key: "active", label: "В работе" },
    { key: "revision", label: "Правка" },
    { key: "delivered", label: "Сдан" },
    { key: "completed", label: "Завершён" },
  ];
  const currentStep = statusFlow.findIndex((s) => s.key === order.status);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <StatusBadge status={order.status} />
              <span className="text-muted-foreground font-mono text-sm">Заказ #{order.id}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold">{order.gigTitle}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isBuyer ? `Продавец: ${order.sellerUsername}` : `Покупатель: ${order.buyerUsername}`}
            </p>
          </div>
          <div className="text-right shrink-0 flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {connected ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-muted-foreground" />}
              {connected ? "Live" : "Offline"}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Сумма заказа</div>
              <div className="text-3xl font-display font-bold text-primary">${order.totalPrice}</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {order.status !== "cancelled" && order.status !== "disputed" && (
          <div className="mb-8 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 right-0 top-4 h-0.5 bg-white/10 -z-0" />
              <div
                className="absolute left-0 top-4 h-0.5 bg-primary transition-all duration-500 -z-0"
                style={{ width: `${(currentStep / (statusFlow.length - 1)) * 100}%` }}
              />
              {statusFlow.map((s, i) => (
                <div key={s.key} className="flex flex-col items-center gap-2 z-10">
                  <div
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                      i <= currentStep
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-white/20 text-muted-foreground"
                    }`}
                  >
                    {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-xs hidden sm:block ${i <= currentStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Chat */}
          <div className="md:col-span-2 flex flex-col" style={{ height: "clamp(400px, 60vh, 580px)" }}>
            <Card className="flex-1 flex flex-col bg-background border-white/10 overflow-hidden">
              <CardHeader className="border-b border-white/10 bg-white/5 py-3 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Чат по заказу
                  {!connected && (
                    <span className="text-[10px] text-muted-foreground font-normal ml-auto flex items-center gap-1">
                      <WifiOff className="w-3 h-3" />
                      polling
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
                {/* Requirements bubble */}
                <div className="flex flex-col gap-1 w-full max-w-[85%] self-start">
                  <div className="text-xs text-muted-foreground ml-1">📋 Требования к заказу</div>
                  <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-sm text-sm whitespace-pre-wrap">
                    {order.requirements}
                  </div>
                </div>

                {messagesLoading ? (
                  <div className="text-center text-muted-foreground py-4 text-sm">Загрузка...</div>
                ) : (
                  uniqueMessages.map((msg) => {
                    const isMine = msg.senderId === user?.id;
                    const isDelivery = msg.content.startsWith("📦 Работа сдана:");
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col gap-1 w-full max-w-[85%] ${isMine ? "self-end" : "self-start"}`}
                      >
                        <div className={`text-xs text-muted-foreground flex items-center gap-2 ${isMine ? "justify-end mr-1" : "ml-1"}`}>
                          {!isMine && <span className="font-medium text-foreground">{msg.sender?.displayName || msg.sender?.username || "Пользователь"}</span>}
                          <span>{new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div
                          className={`p-3 text-sm rounded-2xl whitespace-pre-wrap ${
                            isDelivery
                              ? "bg-green-500/10 border border-green-500/20 text-green-300 rounded-tl-sm"
                              : isMine
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-white/10 border border-white/5 rounded-tl-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </CardContent>

              {order.status !== "completed" && order.status !== "cancelled" && (
                <div className="p-3 bg-background border-t border-white/10">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                      placeholder={connected ? "Написать сообщение... (Live)" : "Написать сообщение... (polling)"}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="bg-white/5 border-white/10 h-9"
                      disabled={sendMessageRest.isPending}
                    />
                    <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!message.trim() || sendMessageRest.isPending}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Actions card */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Управление заказом</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* SELLER: pending → accept or decline */}
                {isSeller && order.status === "pending" && (
                  <>
                    <Button
                      className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleStatus("active")}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Принять заказ
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => handleStatus("cancelled")}
                      disabled={updateStatus.isPending}
                    >
                      <XCircle className="w-4 h-4" />
                      Отклонить заказ
                    </Button>
                  </>
                )}

                {/* SELLER: active or revision → deliver */}
                {isSeller && (order.status === "active" || order.status === "revision") && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => setShowDeliverDialog(true)}
                    disabled={updateStatus.isPending}
                  >
                    <PackageCheck className="w-4 h-4" />
                    {order.status === "revision" ? "Сдать правку" : "Сдать работу"}
                  </Button>
                )}

                {/* SELLER: revision status info */}
                {isSeller && order.status === "revision" && order.deliveryNote && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300">
                    <div className="font-semibold mb-1">Требование покупателя:</div>
                    <div className="whitespace-pre-wrap">{order.deliveryNote}</div>
                  </div>
                )}

                {/* BUYER: pending → cancel */}
                {isBuyer && order.status === "pending" && (
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    onClick={() => handleStatus("cancelled")}
                    disabled={updateStatus.isPending}
                  >
                    <XCircle className="w-4 h-4" />
                    Отменить заказ
                  </Button>
                )}

                {/* BUYER: delivered → accept or revision */}
                {isBuyer && order.status === "delivered" && (
                  <div className="space-y-2">
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400 text-center">
                      Продавец сдал работу. Проверьте результат.
                    </div>
                    <Button
                      className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleStatus("completed")}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Принять работу
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      onClick={() => { setRevisionNote(""); setShowRevisionDialog(true); }}
                      disabled={updateStatus.isPending}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Запросить правку
                    </Button>
                  </div>
                )}

                {/* BUYER: revision requested state */}
                {isBuyer && order.status === "revision" && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300 text-center">
                    Правка запрошена — ожидайте исполнителя
                  </div>
                )}

                {/* Completed state + leave review */}
                {order.status === "completed" && (
                  <div className="space-y-3">
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                      <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
                      <div className="text-sm text-green-400 font-medium">Заказ завершён</div>
                    </div>
                    {isBuyer && (
                      <Button
                        variant="outline"
                        className="w-full gap-2 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                        onClick={() => setShowReviewDialog(true)}
                      >
                        <Star className="w-4 h-4" />
                        Оставить отзыв
                      </Button>
                    )}
                  </div>
                )}

                {order.status === "cancelled" && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center text-sm text-red-400">
                    Заказ отменён
                  </div>
                )}

                {/* DISPUTE BUTTON — visible to both parties on active/delivered/revision orders */}
                {(isBuyer || isSeller) &&
                  ["active", "delivered", "revision"].includes(order.status) &&
                  !(order as any).isDisputed && (
                  <Button
                    variant="ghost"
                    className="w-full gap-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 text-sm border border-orange-500/20 mt-1"
                    onClick={handleDispute}
                    disabled={disputeLoading || updateStatus.isPending}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {disputeLoading ? "Открываем спор..." : "Открыть спор"}
                  </Button>
                )}

                {/* DISPUTE ACTIVE STATE */}
                {(order as any).isDisputed && (
                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-center text-sm text-orange-400">
                    <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
                    <div className="font-medium">Открыт спор</div>
                    <div className="text-xs text-orange-400/70 mt-0.5">Администратор рассматривает ситуацию</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info card */}
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Детали заказа</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Покупатель</span>
                    <Link href={`/profile/${order.buyerId}`} className="font-medium hover:text-primary transition-colors">
                      {order.buyerUsername}
                    </Link>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Продавец</span>
                    <Link href={`/profile/${order.sellerId}`} className="font-medium hover:text-primary transition-colors">
                      {order.sellerUsername}
                    </Link>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Создан</span>
                    <span>{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Срок</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span>{order.deliveryDays} дн.</span>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/10">
                  <Link href={`/gigs/${order.gigId}`} className="text-xs text-primary hover:underline">
                    Посмотреть услугу →
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Delivery / Revision note card */}
            {order.deliveryNote && (
              <Card className={`border ${
                order.status === "revision"
                  ? "bg-purple-500/5 border-purple-500/20"
                  : "bg-green-500/5 border-green-500/20"
              }`}>
                <CardContent className="p-4 space-y-1">
                  <h4 className={`font-semibold text-sm flex items-center gap-2 ${
                    order.status === "revision" ? "text-purple-400" : "text-green-400"
                  }`}>
                    {order.status === "revision" ? (
                      <><RefreshCw className="w-3.5 h-3.5" />Требование правки</>
                    ) : (
                      <><PackageCheck className="w-3.5 h-3.5" />Сообщение о сдаче</>
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {order.deliveryNote}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Safety tip */}
            <Card className="bg-background border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Безопасность</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Никогда не платите за пределами платформы. Все коммуникации и передача работ — только через этот чат.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Deliver dialog */}
      <Dialog open={showDeliverDialog} onOpenChange={setShowDeliverDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>Сдать работу</DialogTitle>
            <DialogDescription>
              Опишите что вы сделали, прикрепите ссылки на результат.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeliver} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Сообщение о сдаче (опционально)</Label>
              <Textarea
                placeholder="Описание выполненной работы, ссылки на файлы, инструкции..."
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                className="min-h-[120px] bg-background/50 border-white/10"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowDeliverDialog(false)}>
                Отмена
              </Button>
              <Button type="submit" className="flex-1 gap-2" disabled={updateStatus.isPending || sendMessageRest.isPending}>
                <PackageCheck className="w-4 h-4" />
                Подтвердить сдачу
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revision request dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>Запросить правку</DialogTitle>
            <DialogDescription>
              Опишите, что нужно исправить или доработать. Исполнитель получит уведомление.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRevision} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Что нужно исправить <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Опишите конкретные изменения: что не так, что добавить, что убрать..."
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                className="min-h-[120px] bg-background/50 border-white/10 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowRevisionDialog(false)}>
                Отмена
              </Button>
              <Button
                type="submit"
                className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700"
                disabled={!revisionNote.trim() || updateStatus.isPending}
              >
                <RefreshCw className="w-4 h-4" />
                Запросить правку
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Review dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle>Оставить отзыв</DialogTitle>
            <DialogDescription>
              Ваш отзыв поможет другим клиентам выбрать специалиста
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReview} className="space-y-5 mt-2">
            {/* Star rating */}
            <div className="space-y-2">
              <Label>Оценка</Label>
              <div className="flex items-center gap-1">
                {Array(5).fill(0).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setHoverRating(i + 1)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setReviewRating(i + 1)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        i < (hoverRating || reviewRating)
                          ? "text-yellow-400 fill-current"
                          : "text-white/20"
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-3 text-sm text-muted-foreground">
                  {["", "Плохо", "Ниже ожиданий", "Нормально", "Хорошо", "Отлично!"][hoverRating || reviewRating]}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Комментарий (опционально)</Label>
              <Textarea
                placeholder="Расскажите о своём опыте работы с исполнителем..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="min-h-[100px] bg-background/50 border-white/10"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowReviewDialog(false)}>
                Пропустить
              </Button>
              <Button type="submit" className="flex-1" disabled={createReview.isPending}>
                Опубликовать отзыв
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
