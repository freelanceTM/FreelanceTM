import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Gavel, CheckCircle, XCircle, RefreshCw, Loader2,
  MessageSquare, X, AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface DisputeRow {
  id: number;
  orderId: number;
  reason: string;
  status: "open" | "resolving" | "resolved" | "cancelled";
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
  order: {
    id: number;
    totalPrice: string;
    gig: { title: string } | null;
    buyer: { username: string };
    seller: { username: string };
  };
  initiator: { username: string; displayName: string | null };
}

interface ChatMessage {
  id: number;
  content: string;
  createdAt: string;
  sender: { id: number; username: string; displayName: string | null; avatarUrl: string | null };
}

type Filter = "open" | "resolving" | "resolved" | "all";

function statusBadge(s: string) {
  if (s === "resolved") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Решён</Badge>;
  if (s === "resolving") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">На рассмотрении</Badge>;
  if (s === "cancelled") return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Отменён</Badge>;
  return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Открыт</Badge>;
}

export default function AdminDisputes() {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Chat history modal state
  const [chatModalDispute, setChatModalDispute] = useState<DisputeRow | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);

  const getToken = () => JSON.parse(localStorage.getItem("ftm_tokens") || "{}").accessToken || "";

  const fetchDisputes = async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`${API_BASE}/api/admin/disputes${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const json = await res.json();
        setDisputes(json.data ?? []);
      }
    } catch {}
    setLoading(false);
  };

  const openChatHistory = async (dispute: DisputeRow) => {
    setChatModalDispute(dispute);
    setChatMessages([]);
    setLoadingChat(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders/${dispute.orderId}/messages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const json = await res.json();
        setChatMessages(json.data ?? []);
      }
    } catch {}
    setLoadingChat(false);
  };

  const handleResolve = async (disputeId: number, resolution: "buyer_wins" | "seller_wins") => {
    setProcessingId(disputeId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Ошибка");
      toast({
        title: resolution === "buyer_wins"
          ? "↩️ Решено в пользу покупателя — эскроу возвращён"
          : "✅ Решено в пользу продавца — эскроу выплачен",
      });
      setChatModalDispute(null);
      fetchDisputes();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  useEffect(() => { fetchDisputes(); }, [filter]);

  const filterLabels: Record<Filter, string> = {
    open: "Открытые",
    resolving: "На рассмотрении",
    resolved: "Решённые",
    all: "Все",
  };

  return (
    <AdminLayout>
      {/* Chat History Modal */}
      {chatModalDispute && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setChatModalDispute(null)}>
          <div className="bg-background border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="font-display font-bold text-lg">История чата — Спор #{chatModalDispute.id}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Заказ #{chatModalDispute.orderId} · {chatModalDispute.order.gig?.title ?? "Прямой контракт"}
                </p>
              </div>
              <button onClick={() => setChatModalDispute(null)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
              {loadingChat ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Сообщений нет</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold">
                      {(msg.sender.displayName || msg.sender.username).substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{msg.sender.displayName || msg.sender.username}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {(chatModalDispute.status === "open" || chatModalDispute.status === "resolving") && (
              <div className="p-5 border-t border-white/10">
                <p className="text-xs text-muted-foreground mb-3">Вынести решение по спору:</p>
                <div className="flex gap-3">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={processingId === chatModalDispute.id}
                    onClick={() => handleResolve(chatModalDispute.id, "buyer_wins")}
                  >
                    {processingId === chatModalDispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    Вернуть покупателю
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    disabled={processingId === chatModalDispute.id}
                    onClick={() => handleResolve(chatModalDispute.id, "seller_wins")}
                  >
                    {processingId === chatModalDispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Выплатить продавцу
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold">⚖️ Споры</h1>
            <p className="text-muted-foreground text-sm mt-1">Арбитраж активных споров</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDisputes} className="gap-2 border-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["open", "resolving", "resolved", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === f ? "bg-primary/20 border-primary text-primary" : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
              }`}>
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : disputes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Gavel className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Нет споров в этой категории</p>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((d) => (
              <Card key={d.id} className={`border-white/10 ${d.status === "open" || d.status === "resolving" ? "border-orange-500/30 bg-orange-500/5" : "bg-white/5"}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-lg font-display font-bold text-orange-400">
                          {(Number(d.order.totalPrice) / 1e9).toFixed(4)} TON
                        </span>
                        {statusBadge(d.status)}
                        <span className="text-xs text-muted-foreground font-mono">Спор #{d.id}</span>
                      </div>

                      <p className="text-sm font-medium text-foreground mb-1 truncate">
                        {d.order.gig?.title ?? "Прямой контракт"} — Заказ #{d.orderId}
                      </p>

                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div>
                          Покупатель: <span className="text-foreground font-medium">@{d.order.buyer.username}</span>
                          {" "}vs{" "}
                          Продавец: <span className="text-foreground font-medium">@{d.order.seller.username}</span>
                        </div>
                        <div>
                          Инициатор: <span className="text-foreground">@{d.initiator.username}</span>
                        </div>
                        {d.reason && (
                          <div className="text-xs mt-1 p-2 bg-white/5 rounded-lg border border-white/10 italic">
                            «{d.reason.substring(0, 200)}{d.reason.length > 200 ? "…" : ""}»
                          </div>
                        )}
                        <div className="text-xs mt-1">
                          {new Date(d.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-white/10 w-full"
                        onClick={() => openChatHistory(d)}
                      >
                        <MessageSquare className="w-3 h-3" />
                        История чата
                      </Button>

                      {(d.status === "open" || d.status === "resolving") && (
                        <>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white w-full"
                            disabled={processingId === d.id}
                            onClick={() => handleResolve(d.id, "buyer_wins")}
                          >
                            {processingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                            Вернуть покупателю
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white w-full"
                            disabled={processingId === d.id}
                            onClick={() => handleResolve(d.id, "seller_wins")}
                          >
                            {processingId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Выплатить продавцу
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
