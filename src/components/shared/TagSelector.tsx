import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { X, Plus, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const TAG_COLORS = ["#8B5CF6", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#6366F1", "#14B8A6"];

const tailwindColorMap: Record<string, string> = {
  "bg-white": "#ffffff", "bg-red-500": "#ef4444", "bg-orange-500": "#f97316",
  "bg-amber-400": "#fbbf24", "bg-yellow-300": "#fde047", "bg-lime-400": "#a3e635",
  "bg-green-500": "#22c55e", "bg-emerald-500": "#10b981", "bg-teal-500": "#14b8a6",
  "bg-cyan-400": "#22d3ee", "bg-sky-500": "#0ea5e9", "bg-blue-500": "#3b82f6",
  "bg-indigo-500": "#6366f1", "bg-violet-500": "#8b5cf6", "bg-purple-500": "#a855f7",
  "bg-fuchsia-500": "#d946ef", "bg-pink-500": "#ec4899", "bg-rose-500": "#f43f5e",
  "bg-gray-400": "#9ca3af", "bg-indigo-900": "#312e81", "bg-purple-300": "#d8b4fe",
  "bg-slate-400": "#94a3b8", "bg-blue-800": "#1e40af", "bg-sky-300": "#7dd3fc",
  "bg-amber-700": "#b45309", "bg-gray-600": "#4b5563", "bg-primary": "#8B5CF6",
};

const resolveTagColor = (color: string): string => {
  if (color.startsWith("bg-")) return tailwindColorMap[color] || "#8B5CF6";
  if (color.startsWith("#")) return color;
  return "#8B5CF6";
};

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface TagSelectorProps {
  contactId: string;
  compact?: boolean;
  onTagsChange?: () => void;
}

const TagSelector = ({ contactId, compact = false, onTagsChange }: TagSelectorProps) => {
  const { user } = useAuth();
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [assignedTagIds, setAssignedTagIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!user) return;
    const [{ data: tags }, { data: assigned }] = await Promise.all([
      supabase.from("tags").select("id, name, color").eq("user_id", user.id),
      supabase.from("contact_tags").select("tag_id").eq("contact_id", contactId),
    ]);
    setAllTags((tags as TagItem[]) || []);
    setAssignedTagIds(new Set((assigned || []).map((a: any) => a.tag_id)));
  }, [contactId, user]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const toggleTag = async (tagId: string) => {
    if (assignedTagIds.has(tagId)) {
      await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
      setAssignedTagIds((prev) => { const n = new Set(prev); n.delete(tagId); return n; });
    } else {
      await supabase.from("contact_tags").insert({ contact_id: contactId, tag_id: tagId });
      setAssignedTagIds((prev) => new Set(prev).add(tagId));
    }
    onTagsChange?.();
  };

  const createAndAssignTag = async (name: string) => {
    if (!user || creating) return;
    setCreating(true);
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    const { data } = await supabase.from("tags").insert({ name: name.trim(), color, user_id: user.id }).select("id, name, color").single();
    if (data) {
      setAllTags((prev) => [...prev, data as TagItem]);
      await supabase.from("contact_tags").insert({ contact_id: contactId, tag_id: data.id });
      setAssignedTagIds((prev) => new Set(prev).add(data.id));
    }
    setSearchTerm("");
    setOpen(false);
    setCreating(false);
    onTagsChange?.();
  };

  const assignedTags = allTags.filter((t) => assignedTagIds.has(t.id));
  const filteredTags = useMemo(() => {
    if (!searchTerm.trim()) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allTags, searchTerm]);

  const showCreateOption = searchTerm.trim().length > 0 && !allTags.some((t) => t.name.toLowerCase() === searchTerm.trim().toLowerCase());

  if (compact) {
    return (
      <div className="relative w-full">
        <div
          className="flex items-center gap-1 flex-wrap border-b-2 border-primary px-1 py-1.5 min-h-[32px] cursor-text"
          onClick={() => setOpen(true)}
        >
          {assignedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white cursor-pointer hover:opacity-90 shrink-0"
              style={{ backgroundColor: resolveTagColor(tag.color) }}
            >
              {tag.name}
              <X
                className="h-3 w-3 opacity-80 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); toggleTag(tag.id); }}
              />
            </span>
          ))}
          {open ? (
            <input
              type="text"
              placeholder={assignedTags.length === 0 ? "Tags" : ""}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && showCreateOption) createAndAssignTag(searchTerm); }}
              className="flex-1 min-w-[60px] text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
              autoFocus
            />
          ) : (
            <span className="flex-1 text-sm text-muted-foreground">Tags</span>
          )}
          {open && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); setSearchTerm(""); }}
              className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open && (filteredTags.length > 0 || showCreateOption) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
            {filteredTags.map((tag) => {
              const isAssigned = assignedTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => { if (!isAssigned) { toggleTag(tag.id); setSearchTerm(""); setOpen(false); } }}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors",
                    isAssigned ? "bg-muted/50 cursor-default" : "hover:bg-muted cursor-pointer"
                  )}
                >
                  <span className="flex-1 text-left text-foreground">{tag.name}</span>
                  {isAssigned && <span className="text-xs text-primary font-bold">✓</span>}
                </button>
              );
            })}
            {showCreateOption && (
              <button
                onClick={() => createAndAssignTag(searchTerm)}
                disabled={creating}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted cursor-pointer text-primary font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Criar "{searchTerm.trim()}"</span>
              </button>
            )}
          </div>
        )}
        {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Tags</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {assignedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white cursor-pointer hover:opacity-90 shrink-0"
            style={{ backgroundColor: resolveTagColor(tag.color) }}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.name}
            <X className="h-3 w-3" />
          </span>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <Plus className="h-3 w-3" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <input
            type="text"
            placeholder="Buscar ou criar tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && showCreateOption) createAndAssignTag(searchTerm); }}
            className="w-full px-2 py-1.5 text-sm bg-transparent border-b border-border outline-none placeholder:text-muted-foreground text-foreground mb-1"
            autoFocus
          />
          {filteredTags.length === 0 && !showCreateOption && (
            <p className="text-xs text-muted-foreground px-2 py-2">Crie tags em Configurações</p>
          )}
          {filteredTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm transition-colors"
            >
              <span
                className="h-3 w-3 rounded-full shrink-0 border border-border"
                style={{ backgroundColor: resolveTagColor(tag.color) }}
              />
              <span className="flex-1 text-left text-foreground truncate">{tag.name}</span>
              {assignedTagIds.has(tag.id) && (
                <span className="text-xs text-primary font-bold">✓</span>
              )}
            </button>
          ))}
          {showCreateOption && (
            <button
              onClick={() => createAndAssignTag(searchTerm)}
              disabled={creating}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-sm transition-colors text-primary font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Criar "{searchTerm.trim()}"</span>
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default TagSelector;
