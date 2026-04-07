import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Tag } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContactProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'conversations' | 'notes' | 'info'>('conversations');

  useEffect(() => {
    if (!id) return;
    api.get<any>(`/contacts/${id}/profile`)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex h-full items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="flex h-full items-center justify-center text-muted-foreground">Contato não encontrado</div>;

  const { contact, conversations, notes, stats } = data;
  const statusColor: Record<string, string> = {
    open: 'bg-green-500/10 text-green-600 border-green-500/20',
    closed: 'bg-gray-500/10 text-gray-600',
    archived: 'bg-yellow-500/10 text-yellow-600'
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{contact.name || contact.phone}</h1>
          <p className="text-sm text-muted-foreground">{contact.phone}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center"><p className="text-lg font-bold text-foreground">{stats?.total_conversations ?? 0}</p><p className="text-xs text-muted-foreground">conversas</p></div>
          <div className="text-center"><p className="text-lg font-bold text-green-500">{stats?.open_conversations ?? 0}</p><p className="text-xs text-muted-foreground">abertas</p></div>
          {stats?.avg_csat && <div className="text-center"><p className="text-lg font-bold text-yellow-500">⭐ {stats.avg_csat}</p><p className="text-xs text-muted-foreground">CSAT médio</p></div>}
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-6 border-b border-border px-6 py-2 text-sm text-muted-foreground bg-muted/20">
        {contact.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5"/>{contact.email}</span>}
        {contact.tags?.length > 0 && <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5"/>{contact.tags.join(', ')}</span>}
        {contact.city && <span>{contact.city}{contact.state ? `, ${contact.state}` : ''}</span>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6">
        {(['conversations', 'notes', 'info'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t === 'conversations' ? `Conversas (${conversations.length})` : t === 'notes' ? `Notas (${notes.length})` : 'Informações'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'conversations' && (
          <div className="space-y-3">
            {(conversations || []).map((c: any) => (
              <Link key={c.id} to={`/inbox?conversation=${c.id}`}
                className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className={`text-xs ${statusColor[c.status] || ''}`}>{c.status}</Badge>
                  <span className="text-xs text-muted-foreground">{c.created_at ? format(new Date(c.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : ''}</span>
                </div>
                {c.last_message_body && <p className="text-sm text-foreground truncate">{c.last_message_body}</p>}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {c.agent_name && <span>👤 {c.agent_name}</span>}
                  {c.category_name && <span>📂 {c.category_name}</span>}
                  {c.csat_score && <span>⭐ {c.csat_score}/5</span>}
                </div>
              </Link>
            ))}
            {(conversations || []).length === 0 && <p className="text-center text-muted-foreground py-12">Nenhuma conversa</p>}
          </div>
        )}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            {(notes || []).map((n: any) => (
              <div key={n.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{n.author_name}</span>
                  <span className="text-xs text-muted-foreground">{n.created_at ? format(new Date(n.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : ''}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
              </div>
            ))}
            {(notes || []).length === 0 && <p className="text-center text-muted-foreground py-12">Nenhuma nota</p>}
          </div>
        )}
        {activeTab === 'info' && (
          <div className="space-y-4 max-w-lg">
            {([
              ['Nome', contact.name],
              ['Telefone', contact.phone],
              ['Email', contact.email],
              ['Empresa', contact.company],
              ['Cargo', contact.job_title],
              ['Cidade', contact.city],
              ['Estado', contact.state],
              ['País', contact.country],
              ['Notas', contact.notes],
            ] as [string, string][]).filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex gap-4">
                <span className="w-24 text-sm text-muted-foreground shrink-0">{label}</span>
                <span className="text-sm text-foreground">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
