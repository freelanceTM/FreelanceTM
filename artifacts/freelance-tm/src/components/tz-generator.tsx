import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Bot, Send, Sparkles, Copy, Check, ClipboardList } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface TZGeneratorProps {
  onApply: (text: string) => void;
}

async function sendToAI(messages: Message[]): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, mode: "tz" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (res.status === 429) throw new Error("rate_limit");
    throw new Error(data.error ?? "AI request failed");
  }
  const data = await res.json() as { content: string };
  return data.content;
}

function extractTZ(content: string): string | null {
  if (!content.includes("[ТЗ_ГОТОВО]")) return null;
  return content.replace("[ТЗ_ГОТОВО]", "").trim();
}

export function TZGenerator({ onApply }: TZGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedTZ, setGeneratedTZ] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleOpen = () => {
    setOpen(true);
    if (messages.length === 0) {
      // Kick off with intro message
      const intro: Message = {
        role: "assistant",
        content: "Привет! Я помогу вам составить грамотное техническое задание. Расскажите в двух словах — что нужно сделать?",
      };
      setMessages([intro]);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const reply = await sendToAI(newMessages);
      const tz = extractTZ(reply);
      if (tz) {
        setGeneratedTZ(tz);
        const cleanReply = reply.replace("[ТЗ_ГОТОВО]", "").trim();
        setMessages((prev) => [...prev, { role: "assistant", content: cleanReply }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
    } catch (err) {
      const isRateLimit = err instanceof Error && err.message === "rate_limit";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isRateLimit
            ? "⏳ Достигнут лимит запросов к ИИ. Подождите минуту и попробуйте снова."
            : "Произошла ошибка. Попробуйте ещё раз.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleApply = () => {
    if (generatedTZ) {
      onApply(generatedTZ);
      setOpen(false);
    }
  };

  const handleCopy = async () => {
    if (generatedTZ) {
      await navigator.clipboard.writeText(generatedTZ);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const reset = () => {
    setMessages([]);
    setGeneratedTZ(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10 text-xs"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Помочь составить ТЗ с ИИ
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-white/10 max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-primary" />
              </div>
              Генератор ТЗ
            </DialogTitle>
            <DialogDescription>
              ИИ задаст несколько вопросов и составит готовое техническое задание
            </DialogDescription>
          </DialogHeader>

          {/* Chat */}
          <div className="px-4 py-3 space-y-3 overflow-y-auto max-h-72 min-h-[160px]">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-white/5 border border-white/10 rounded-tl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Generated TZ preview */}
          <AnimatePresence>
            {generatedTZ && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-4 mb-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-green-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> ТЗ готово
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {generatedTZ}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          {!generatedTZ ? (
            <form onSubmit={handleSubmit} className="flex gap-2 px-4 pb-4">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ваш ответ..."
                className="bg-white/5 border-white/10 h-9 text-sm"
                disabled={loading}
                autoFocus
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!input.trim() || loading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          ) : (
            <div className="flex gap-2 px-4 pb-4">
              <Button variant="ghost" size="sm" onClick={reset} className="flex-1 text-sm">
                Переделать
              </Button>
              <Button size="sm" onClick={handleApply} className="flex-1 text-sm gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Вставить в требования
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
