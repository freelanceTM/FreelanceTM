import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function useSocket(orderId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    if (!orderId) return;

    const tokens = JSON.parse(localStorage.getItem("ftm_tokens") || "{}");
    if (!tokens.accessToken) return;

    const socket = io(`${SOCKET_URL}/messages`, {
      auth: { token: tokens.accessToken },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("joinOrder", { orderId });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("newMessage", (msg) => {
      setLastMessage({ type: "new", data: msg });
    });

    socket.on("messagesRead", (data) => {
      setLastMessage({ type: "read", data });
    });

    socket.on("joined", () => {
      // joined room
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId]);

  const sendMessage = useCallback(
    (content: string, attachments?: string[]) => {
      if (!socketRef.current || !orderId) return;
      socketRef.current.emit("sendMessage", { orderId, content, attachments });
    },
    [orderId],
  );

  const markRead = useCallback(() => {
    if (!socketRef.current || !orderId) return;
    socketRef.current.emit("markRead", { orderId });
  }, [orderId]);

  return { socket: socketRef.current, connected, lastMessage, sendMessage, markRead };
}
