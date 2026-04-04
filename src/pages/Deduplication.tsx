import { useState } from "react";
import { Users, GitMerge, Eye, Trash2, Search, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/db";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContactRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  custom_fields: Record<string, string> | null;
  lead_score: number | null;
  created_at: string;
  conversationCount?: number;
}

interface DuplicateGroup {
  reason: "same_phone" | "similar_name" | "same_email";
  contacts: ContactRow[];
  confidence: "high" | "medium" | "low";
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-11);
}

function similarityScore(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  if (la.length < 3 || lb.length < 3) return la === lb ? 1 : 0;
  const trigrams = (s: string) =>
    new Set(Array.from({ length: s.length - 2 }, (_, i) => s.slice(i, i + 3)));
  const ta = trigrams(la);
  const tb = trigrams(lb);
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  return intersection / (ta.size + tb.size - intersection);
}

function detectReason(group: ContactRow[]): DuplicateGroup["reason"] {
  const a = group[0];
  const b = group[1];
  if (a.phone && b.phone && normalizePhone(a.phone) === normalizePhone(b.phone))
    return "same_phone";
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase())
    return "same_email";
  return "similar_name";
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, phone, email, custom_fields, lead_score, created_at")
    .order("created_at", { ascending: false });

  if (!contacts || contacts.length === 0) return [];

  // Fetch conversation counts
  const { data: convoCounts } = await supabase
    .from("conversations")
    .select("contact_id");

  const convoMap: Record<string, number> = {};
  for (const c of convoCounts || []) {
    convoMap[c.contact_id] = (convoMap[c.contact_id] || 0) + 1;
  }

  const enriched: ContactRow[] = contacts.map((c) => ({
    ...c,
    name: c.name ?? null,
    email: c.email ?? null,
    custom_fields: (c.custom_fields as Record<string, string> | null) ?? null,
    lead_score: (c as any).lead_score ?? null,
    conversationCount: convoMap[c.id] || 0,
  }));

  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < enriched.length; i++) {
    if (processed.has(enriched[i].id)) continue;
    const group: ContactRow[] = [enriched[i]];

    for (let j = i + 1; j < enriched.length; j++) {
      if (processed.has(enriched[j].id)) continue;
      const a = enriched[i];
      const b = enriched[j];

      if (a.phone && b.phone && normalizePhone(a.phone) === normalizePhone(b.phone)) {
        group.push(b);
        processed.add(b.id);
        continue;
      }
      if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) {
        group.push(b);
        processed.add(b.id);
        continue;
      }
      if (
        a.name &&
        b.name &&
        a.name.length >= 3 &&
        b.name.length >= 3 &&
        similarityScore(a.name, b.name) > 0.85
      ) {
        group.push(b);
        processed.add(b.id);
      }
    }

    if (group.length > 1) {
      processed.add(enriched[i].id);
      const reason = detectReason(group);
      const confidence: DuplicateGroup["confidence"] =
        reason === "same_phone" || reason === "same_email" ? "high" : "medium";
      groups.push({ reason, contacts: group, confidence });
    }
  }

  return groups;
}

async function mergeContacts(primaryId: string, secondaryIds: string[]) {
  for (const secId of secondaryIds) {
    await supabase
      .from("conversations")
      .update({ contact_id: primaryId } as any)
      .eq("contact_id", secId);
    await supabase
      .from("campaign_contacts" as any)
      .update({ contact_id: primaryId })
      .eq("contact_id", secId);
    await supabase
      .from("opportunities" as any)
      .update({ contact_id: primaryId })
      .eq("contact_id", secId);
  }

  // Merge contact_tags (union)
  for (const secId of secondaryIds) {
    const { data: secTags } = await supabase
      .from("contact_tags" as any)
      .select("tag_id")
      .eq("contact_id", secId);

    if (secTags && secTags.length > 0) {
      const rows = secTags.map((t: any) => ({ contact_id: primaryId, tag_id: t.tag_id }));
      await supabase
        .from("contact_tags" as any)
        .upsert(rows, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    }
  }

  // Delete secondary contacts
  await supabase.from("contacts").delete().in("id", secondaryIds);
  toast.success("Contatos mesclados com sucesso!");
}

const reasonLabel: Record<DuplicateGroup["reason"], string> = {
  same_phone: "Mesmo telefone",
  same_email: "Mesmo e-mail",
  similar_name: "Nome similar",
};

const reasonEmoji: Record<DuplicateGroup["reason"], string> = {
  same_phone: "🔴",
  same_email: "🔴",
  similar_name: "🟡",
};

const confidenceLabel: Record<DuplicateGroup["confidence"], string> = {
  high: "Alta confiança",
  medium: "Média confiança",
  low: "Baixa confiança",
};

const confidenceClass: Record<DuplicateGroup["confidence"], string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const Deduplication = () => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium">("all");
  const [mergeDialog, setMergeDialog] = useState<{ groupIndex: number } | null>(null);
  const [selectedPrimary, setSelectedPrimary] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalyzed(false);
    setDismissed(new Set());
    try {
      const result = await findDuplicates();
      setGroups(result);
      setAnalyzed(true);
      if (result.length === 0) {
        toast.info("Nenhuma duplicata encontrada.");
      }
    } catch (e) {
      toast.error("Erro ao analisar duplicatas");
    } finally {
      setLoading(false);
    }
  };

  const visibleGroups = groups.filter((g, i) => {
    if (dismissed.has(i)) return false;
    if (confidenceFilter === "high" && g.confidence !== "high") return false;
    if (confidenceFilter === "medium" && g.confidence !== "medium") return false;
    return true;
  });

  const totalDuplicates = visibleGroups.reduce((acc, g) => acc + g.contacts.length - 1, 0);

  const openMergeDialog = (groupIndex: number) => {
    const realIndex = groups.indexOf(visibleGroups[groupIndex]);
    setSelectedPrimary(visibleGroups[groupIndex].contacts[0].id);
    setMergeDialog({ groupIndex: realIndex });
  };

  const handleMerge = async () => {
    if (!mergeDialog) return;
    const group = groups[mergeDialog.groupIndex];
    const secondaryIds = group.contacts.filter((c) => c.id !== selectedPrimary).map((c) => c.id);
    setMerging(true);
    try {
      await mergeContacts(selectedPrimary, secondaryIds);
      // Remove merged group
      const newDismissed = new Set(dismissed);
      newDismissed.add(mergeDialog.groupIndex);
      setDismissed(newDismissed);
      // Also update groups to reflect deletion
      setGroups((prev) =>
        prev.map((g, i) =>
          i === mergeDialog.groupIndex
            ? { ...g, contacts: g.contacts.filter((c) => c.id === selectedPrimary) }
            : g
        )
      );
      setMergeDialog(null);
    } catch (e) {
      toast.error("Erro ao mesclar contatos");
    } finally {
      setMerging(false);
    }
  };

  const mergeGroup = mergeDialog !== null ? groups[mergeDialog.groupIndex] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <GitMerge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Deduplicação de Contatos
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Encontre e mescle contatos duplicados
            </p>
          </div>
        </div>
        <Button onClick={handleAnalyze} disabled={loading} className="gap-2">
          <Search className="h-4 w-4" />
          {loading ? "Analisando..." : "Analisar duplicatas"}
        </Button>
      </div>

      {/* Stats */}
      {analyzed && (
        <div className="flex gap-4 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span>
              <b>{visibleGroups.length}</b> grupos encontrados
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Users className="h-4 w-4 text-blue-500" />
            <span>
              <b>{totalDuplicates}</b> contatos duplicados
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>
              Economia potencial: <b>{totalDuplicates}</b> contatos
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      {analyzed && groups.length > 0 && (
        <div className="flex gap-2 px-6 py-3 border-b bg-white dark:bg-gray-900 shrink-0">
          {(["all", "high", "medium"] as const).map((f) => (
            <Button
              key={f}
              variant={confidenceFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setConfidenceFilter(f)}
            >
              {f === "all" ? "Todos" : f === "high" ? "Alta confiança" : "Média confiança"}
            </Button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {!analyzed && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
            <GitMerge className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhuma análise realizada</p>
            <p className="text-sm mt-1">Clique em "Analisar duplicatas" para começar</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
            <Search className="h-10 w-10 mb-3 animate-pulse opacity-50" />
            <p className="text-lg font-medium">Analisando contatos...</p>
          </div>
        )}

        {analyzed && visibleGroups.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
            <CheckCircle2 className="h-12 w-12 mb-3 text-green-400" />
            <p className="text-lg font-medium text-green-600">Nenhuma duplicata encontrada!</p>
            <p className="text-sm mt-1">Sua base de contatos está limpa.</p>
          </div>
        )}

        {visibleGroups.map((group, idx) => (
          <DuplicateGroupCard
            key={idx}
            group={group}
            onMerge={() => openMergeDialog(idx)}
            onDismiss={() => {
              const realIndex = groups.indexOf(group);
              setDismissed((prev) => new Set([...prev, realIndex]));
            }}
          />
        ))}
      </div>

      {/* Merge Dialog */}
      {mergeGroup && (
        <Dialog open={!!mergeDialog} onOpenChange={() => setMergeDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Mesclar Contatos</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <p className="text-sm text-gray-500 mb-4">
                Selecione o contato principal. Os demais serão mesclados nele e excluídos.
              </p>
              <div className="space-y-3">
                {mergeGroup.contacts.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedPrimary === c.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <input
                      type="radio"
                      name="primary"
                      value={c.id}
                      checked={selectedPrimary === c.id}
                      onChange={() => setSelectedPrimary(c.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {c.name || "(sem nome)"}
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5 mt-0.5">
                        {c.phone && <div>📱 {c.phone}</div>}
                        {c.email && <div>✉️ {c.email}</div>}
                        <div>
                          Criado em{" "}
                          {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                        <div>{c.conversationCount} conversa(s)</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMergeDialog(null)} disabled={merging}>
                Cancelar
              </Button>
              <Button onClick={handleMerge} disabled={merging || !selectedPrimary}>
                {merging ? "Mesclando..." : "Confirmar mesclagem"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  onMerge: () => void;
  onDismiss: () => void;
}

const DuplicateGroupCard = ({ group, onMerge, onDismiss }: DuplicateGroupCardProps) => {
  return (
    <Card className="p-4 border shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-medium gap-1">
            {reasonEmoji[group.reason]} {reasonLabel[group.reason]}
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs font-medium ${confidenceClass[group.confidence]}`}
          >
            {confidenceLabel[group.confidence]}
          </Badge>
          <span className="text-xs text-gray-400">{group.contacts.length} contatos</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 h-7 w-7 p-0"
          title="Ignorar grupo"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Contacts side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {group.contacts.slice(0, 4).map((c, i) => (
          <div
            key={c.id}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm space-y-1 border border-gray-100 dark:border-gray-700"
          >
            {i === 0 && (
              <div className="text-xs font-semibold text-blue-600 mb-1">Principal sugerido</div>
            )}
            <div className="font-semibold text-gray-900 dark:text-white truncate">
              {c.name || "(sem nome)"}
            </div>
            {c.phone && (
              <div className="text-gray-500 flex items-center gap-1">
                <span>📱</span>
                <span className="truncate">{c.phone}</span>
              </div>
            )}
            {c.email && (
              <div className="text-gray-500 flex items-center gap-1">
                <span>✉️</span>
                <span className="truncate">{c.email}</span>
              </div>
            )}
            {c.lead_score != null && (
              <div className="text-gray-500">
                Score: <b>{c.lead_score}</b>
              </div>
            )}
            <div className="text-gray-400 text-xs">
              Criado: {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
            </div>
            <div className="text-gray-400 text-xs">{c.conversationCount || 0} conversa(s)</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" className="gap-1" onClick={onMerge}>
          <GitMerge className="h-3.5 w-3.5" />
          Mesclar
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={onDismiss}>
          <Trash2 className="h-3.5 w-3.5" />
          Ignorar
        </Button>
        {group.contacts.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant="ghost"
            className="gap-1 text-blue-600 text-xs"
            onClick={() => window.open(`/contatos`, "_blank")}
          >
            <Eye className="h-3 w-3" />
            {c.name?.split(" ")[0] || c.phone}
          </Button>
        ))}
      </div>
    </Card>
  );
};

export default Deduplication;
