import { useState, useEffect } from "react";
import api from "@/lib/api";

// Kanban columns definition
const COLUMNS = [
  { key: "waiting", label: "⏳ Aguardando", status: "open", filter: (c: any) => c.status === "open" && !c.assigned_to },
  { key: "active", label: "💬 Em Atendimento", status: "open", filter: (c: any) => c.status === "open" && c.assigned_to },
  { key: "archived", label: "📦 Arquivadas", status: "archived", filter: (c: any) => c.status === "archived" },
  { key: "closed", label: "✅ Fechadas Hoje", status: "closed", filter: (c: any) => c.status === "closed" },
];

export default function Kanban() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [open, closed] = await Promise.all([
          api.get<any[]>('/conversations?limit=200'),
          api.get<any[]>('/conversations?status=closed&limit=50'),
        ]);
        setConversations([...(open || []), ...(closed || [])]);
      } catch {
        // silently handle errors on interval refresh
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDrop = async (convId: string, newStatus: string) => {
    await api.patch(`/conversations/${convId}`, { status: newStatus });
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: newStatus } : c));
  };

  if (loading) return (
    <div className="flex h-full items-center justify-center text-muted-foreground">Carregando...</div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Kanban de Conversas</h1>
        <span className="text-sm text-muted-foreground">{conversations.length} conversas</span>
      </div>
      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {COLUMNS.map(col => {
          const items = conversations.filter(col.filter);
          return (
            <div
              key={col.key}
              className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                const id = e.dataTransfer.getData('convId');
                if (id) handleDrop(id, col.status);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2 overflow-y-auto">
                {items.map(c => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('convId', c.id)}
                    className="cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow active:cursor-grabbing"
                  >
                    <p className="text-sm font-medium text-foreground truncate">{c.contacts?.name || c.contacts?.phone || 'Contato'}</p>
                    {c.last_message_body && (
                      <p className="text-xs text-muted-foreground truncate mt-1">{c.last_message_body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {c.instance_name && (
                        <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5">{c.instance_name}</span>
                      )}
                      {c.sla_deadline && new Date(c.sla_deadline) < new Date() && (
                        <span className="text-[10px] bg-red-500/10 text-red-500 rounded px-1.5 py-0.5 font-bold">SLA</span>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">Vazio</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
