import { useState, useEffect } from "react";
import { Plus, DollarSign, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "@/lib/api";

export default function Pipeline() {
  const [stages, setStages] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDeal, setNewDeal] = useState<{ stageId: string; title: string } | null>(null);

  const load = async () => {
    const [s, d] = await Promise.all([
      api.get<any[]>('/pipeline/stages'),
      api.get<any[]>('/pipeline/deals'),
    ]);
    if (s) setStages(s);
    if (d) setDeals(d);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDrop = async (dealId: string, newStageId: string) => {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage_id: newStageId } : d));
    await api.patch(`/pipeline/deals/${dealId}`, { stage_id: newStageId });
  };

  const handleCreateDeal = async (stageId: string, title: string) => {
    if (!title.trim()) return;
    const deal = await api.post<any>('/pipeline/deals', { title, stage_id: stageId });
    if (deal) { setDeals(prev => [...prev, deal]); toast.success('Deal criado!'); }
    setNewDeal(null);
  };

  const handleDeleteDeal = async (id: string) => {
    await api.delete(`/pipeline/deals/${id}`);
    setDeals(prev => prev.filter(d => d.id !== id));
    toast.success('Deal excluído');
  };

  const totalValue = (stageId: string) =>
    deals.filter(d => d.stage_id === stageId).reduce((sum, d) => sum + Number(d.value || 0), 0);

  if (loading) return (
    <div className="flex h-full items-center justify-center text-muted-foreground">Carregando...</div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-blue-600">Funil de Vendas</h1>
        <span className="text-sm text-muted-foreground">
          {deals.filter(d => d.status === 'active').length} deals ativos
        </span>
      </div>
      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {stages.map(stage => {
          const stageDeals = deals.filter(d => d.stage_id === stage.id && d.status === 'active');
          return (
            <div
              key={stage.id}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                const id = e.dataTransfer.getData('dealId');
                if (id) handleDrop(id, stage.id);
              }}
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold">{stage.name}</span>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5">
                    {stageDeals.length}
                  </span>
                </div>
                {totalValue(stage.id) > 0 && (
                  <span className="text-xs text-green-500 font-medium">
                    R$ {Number(totalValue(stage.id)).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                {stageDeals.map(deal => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('dealId', deal.id)}
                    className="cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-foreground">{deal.title}</p>
                      <button
                        onClick={() => handleDeleteDeal(deal.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {deal.contact_name && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" />{deal.contact_name}
                      </p>
                    )}
                    {deal.value > 0 && (
                      <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />R$ {Number(deal.value).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {newDeal?.stageId === stage.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="Nome do deal..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateDeal(stage.id, e.currentTarget.value);
                      if (e.key === 'Escape') setNewDeal(null);
                    }}
                    onBlur={e => {
                      if (e.target.value) handleCreateDeal(stage.id, e.target.value);
                      else setNewDeal(null);
                    }}
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1 text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => setNewDeal({ stageId: stage.id, title: '' })}
                >
                  <Plus className="h-3.5 w-3.5" /> Novo deal
                </Button>
              )}
            </div>
          );
        })}

        {stages.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Nenhuma etapa configurada. Execute as migrations SQL para criar as etapas padrão.
          </div>
        )}
      </div>
    </div>
  );
}
