import { useState } from "react";

export interface QueuedMessage {
  id: string;
  conversationId: string;
  content: string;
  type: string;
  timestamp: number;
}

export function useMessageQueue() {
  const [queue, setQueue] = useState<QueuedMessage[]>(() => {
    const saved = localStorage.getItem("message_queue");
    return saved ? JSON.parse(saved) : [];
  });

  const enqueue = (msg: Omit<QueuedMessage, "id" | "timestamp">) => {
    const item: QueuedMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setQueue((prev) => {
      const next = [...prev, item];
      localStorage.setItem("message_queue", JSON.stringify(next));
      return next;
    });
  };

  const dequeue = (id: string) => {
    setQueue((prev) => {
      const next = prev.filter((m) => m.id !== id);
      localStorage.setItem("message_queue", JSON.stringify(next));
      return next;
    });
  };

  return { queue, enqueue, dequeue };
}
