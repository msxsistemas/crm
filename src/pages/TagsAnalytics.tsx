import { useState, useEffect } from "react";
import api from "@/lib/api";
import { Tag, TrendingUp, Users, MessageSquare } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#f97316','#ef4444','#ec4899'];

export default function TagsAnalytics() {
  const [data, setData] = useState<any>({ contactTags: [], convTags: [], trend: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'contacts' | 'conversations'>('contacts');

  useEffect(() => {
    api.get<any>('/stats/tags')
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  const chartData = tab === 'contacts'
    ? data.contactTags.map((t: any) => ({ name: t.tag, value: Number(t.contact_count) }))
    : data.convTags.map((t: any) => ({ name: t.tag, value: Number(t.conv_count) }));

  if (loading) return <div className="flex h-full items-center justify-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Tag className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Analytics de Tags</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tab switch */}
        <div className="flex gap-2">
          {([
            { k: 'contacts', label: 'Contatos', icon: Users },
            { k: 'conversations', label: 'Conversas', icon: MessageSquare },
          ] as const).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === k
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* Bar chart */}
        {chartData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">
              Top Tags — {tab === 'contacts' ? 'Contatos' : 'Conversas'}
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: any) => [v, 'Ocorrências']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.slice(0, 15).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tag cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {chartData.slice(0, 20).map((t: any, i: number) => (
            <div key={t.name} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-sm font-medium truncate">{t.name}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{t.value}</p>
              <p className="text-xs text-muted-foreground">
                {tab === 'contacts' ? 'contatos' : 'conversas'}
              </p>
            </div>
          ))}
        </div>

        {chartData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Tag className="h-12 w-12 mb-4 opacity-30" />
            <p>Nenhuma tag encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}
