import { useState, useEffect } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, TrendingUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Lead {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  lead_score: number;
  lead_score_updated_at: string | null;
}

function getScoreStyle(score: number) {
  if (score >= 76) return { label: 'Muito Quente', emoji: '🔥', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' };
  if (score >= 51) return { label: 'Quente', className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400', emoji: '🟢' };
  if (score >= 26) return { label: 'Morno', className: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400', emoji: '🟡' };
  return { label: 'Frio', className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400', emoji: '🔵' };
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 76 ? 'bg-red-500' : score >= 51 ? 'bg-green-500' : score >= 26 ? 'bg-yellow-500' : 'bg-blue-400';
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

const TopLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState<string | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const data = await api.get<Lead[]>('/contacts/top-leads?limit=20');
      setLeads(data || []);
    } catch {
      toast.error('Erro ao carregar top leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  const handleRecalculate = async (id: string) => {
    setRecalculating(id);
    try {
      const { score } = await api.post<{ score: number }>(`/contacts/${id}/calculate-score`, {});
      setLeads(prev => prev.map(l => l.id === id ? { ...l, lead_score: score } : l).sort((a, b) => b.lead_score - a.lead_score));
      toast.success(`Score atualizado: ${score}`);
    } catch {
      toast.error('Erro ao recalcular score');
    } finally {
      setRecalculating(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Top Leads</h1>
          <p className="text-sm text-muted-foreground">Os 20 contatos com maior score de engajamento</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={fetchLeads}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum lead com score calculado ainda.</p>
          <p className="text-sm mt-1">Vá em Contatos e clique em "Calcular Scores".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead, idx) => {
            const style = getScoreStyle(lead.lead_score);
            const initials = (lead.name || lead.phone).charAt(0).toUpperCase();
            return (
              <div key={lead.id} className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow">
                {/* Rank */}
                <div className="w-8 text-center font-bold text-muted-foreground text-sm shrink-0">
                  #{idx + 1}
                </div>

                {/* Avatar */}
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={lead.avatar_url || ''} />
                  <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{lead.name || lead.phone}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.phone}{lead.email ? ` · ${lead.email}` : ''}{lead.company ? ` · ${lead.company}` : ''}
                  </p>
                  <ScoreBar score={lead.lead_score} />
                </div>

                {/* Score badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={`${style.className} font-bold text-sm px-2.5 py-0.5`}>
                    {style.emoji} {lead.lead_score}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{style.label}</span>
                </div>

                {/* Recalculate button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  disabled={recalculating === lead.id}
                  onClick={() => handleRecalculate(lead.id)}
                  title="Recalcular score"
                >
                  {recalculating === lead.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TopLeads;
