import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Plus, CheckCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { toast } from "sonner";

interface ScoringRule {
  id: string;
  name: string;
  condition_field: string;
  condition_operator?: string;
  condition_value: string | null;
  score_delta: number;
  is_active: boolean;
  created_at: string;
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  has_tag: 'Tem tag',
  campaign_opened: 'Respondeu campanha',
  has_conversation: 'Tem conversa',
  inactivity_days: 'Inativo há X dias',
  has_opportunity: 'Tem oportunidade',
  opportunity_stage: 'Etapa da oportunidade',
  message_count: 'Número de mensagens',
  custom_field: 'Campo customizado',
};

const LeadScoringTab = () => {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formCondType, setFormCondType] = useState('has_conversation');
  const [formCondValue, setFormCondValue] = useState('');
  const [formPoints, setFormPoints] = useState(10);
  const [formActive, setFormActive] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const data = await api.get<ScoringRule[]>('/lead-scoring-rules');
      setRules(data || []);
    } catch {}
    setLoadingRules(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreate = () => {
    setEditingRule(null);
    setFormName('');
    setFormCondType('has_conversation');
    setFormCondValue('');
    setFormPoints(10);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (rule: ScoringRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormCondType(rule.condition_field);
    setFormCondValue(rule.condition_value || '');
    setFormPoints(rule.score_delta);
    setFormActive(rule.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      condition_field: formCondType,
      condition_value: formCondValue.trim() || null,
      score_delta: formPoints,
      is_active: formActive,
    };
    try {
      if (editingRule) {
        await api.patch(`/lead-scoring-rules/${editingRule.id}`, payload);
        toast.success('Regra atualizada!');
      } else {
        await api.post('/lead-scoring-rules', payload);
        toast.success('Regra criada!');
      }
      setDialogOpen(false);
      fetchRules();
    } catch { toast.error(editingRule ? 'Erro ao salvar regra' : 'Erro ao criar regra'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/lead-scoring-rules/${id}`);
      toast.success('Regra excluída!');
      setDeleteConfirmId(null);
      fetchRules();
    } catch { toast.error('Erro ao excluir regra'); }
  };

  const handleToggleActive = async (rule: ScoringRule) => {
    try {
      await api.patch(`/lead-scoring-rules/${rule.id}`, { is_active: !rule.is_active });
      fetchRules();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Regras de Lead Scoring</h3>
              <p className="text-sm text-muted-foreground">Configure os critérios para calcular o score dos contatos (0-100)</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova Regra
          </Button>
        </div>

        {loadingRules ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando regras...
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma regra configurada</p>
            <p className="text-xs mt-1">Crie regras para calcular automaticamente o engajamento dos seus contatos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Condição</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Valor</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pontos</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-right py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2.5 px-3 font-medium text-foreground">{rule.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{CONDITION_TYPE_LABELS[rule.condition_field] || rule.condition_field}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{rule.condition_value || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`font-bold ${rule.score_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {rule.score_delta >= 0 ? '+' : ''}{rule.score_delta}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button onClick={() => handleToggleActive(rule)}>
                        {rule.is_active
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700"><CheckCircle className="h-3 w-3" /> Ativo</span>
                          : <span className="text-xs text-muted-foreground">Inativo</span>
                        }
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeleteConfirmId(rule.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar Regra' : 'Nova Regra de Scoring'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nome da regra</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Tem conversa ativa" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Tipo de condição</label>
              <Select value={formCondType} onValueChange={setFormCondType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONDITION_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Valor da condição <span className="text-muted-foreground text-xs">(opcional)</span></label>
              <Input value={formCondValue} onChange={e => setFormCondValue(e.target.value)} placeholder="Ex: open, 30, negotiation..." />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Pontos (pode ser negativo)</label>
              <Input
                type="number"
                value={formPoints}
                onChange={e => setFormPoints(parseInt(e.target.value) || 0)}
                min={-100}
                max={100}
              />
              <p className="text-xs text-muted-foreground mt-1">Use valores negativos para penalizar (ex: -15 para inatividade)</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <span className="text-sm text-foreground">Regra ativa</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingRule ? 'Salvar alterações' : 'Criar regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Excluir regra</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Tem certeza que deseja excluir esta regra? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadScoringTab;
