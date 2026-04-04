import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, TrendingUp, Clock, Search } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Transaction {
  id: string;
  reseller_id: string;
  amount: number;
  type: string;
  status: string;
  description: string | null;
  created_at: string;
}

const AdminFinance = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => { loadTransactions(); }, []);

  const loadTransactions = async () => {
    setLoading(true);
    const { data } = await supabase.from("reseller_transactions").select("*").order("created_at", { ascending: false }).limit(200);
    const txs = (data as any[]) || [];
    setTransactions(txs);

    // Build monthly chart
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const paid = txs.filter(t => t.status === "paid" && t.created_at?.startsWith(key)).reduce((s, t) => s + Number(t.amount), 0);
      const pending = txs.filter(t => t.status === "pending" && t.created_at?.startsWith(key)).reduce((s, t) => s + Number(t.amount), 0);
      months.push({ name: label, pago: paid, pendente: pending });
    }
    setChartData(months);
    setLoading(false);
  };

  const totalRevenue = transactions.filter(t => t.status === "paid").reduce((s, t) => s + Number(t.amount), 0);
  const pendingRevenue = transactions.filter(t => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0);
  const totalTransactions = transactions.length;

  const filtered = transactions.filter(t =>
    (t.description || "").toLowerCase().includes(search.toLowerCase()) ||
    t.type.toLowerCase().includes(search.toLowerCase()) ||
    t.status.toLowerCase().includes(search.toLowerCase())
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-md">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">R$ {p.value.toFixed(2)}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
        <p className="text-muted-foreground">Acompanhe receitas e transações</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10"><TrendingUp className="h-6 w-6 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Receita Total</p><p className="text-2xl font-bold">R$ {totalRevenue.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10"><Clock className="h-6 w-6 text-amber-500" /></div>
            <div><p className="text-sm text-muted-foreground">Pendente</p><p className="text-2xl font-bold">R$ {pendingRevenue.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><CreditCard className="h-6 w-6 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Total de Transações</p><p className="text-2xl font-bold">{totalTransactions}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Receita Mensal (últimos 6 meses)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Area type="natural" dataKey="pago" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "#fff" }} name="Pago" />
              <Area type="natural" dataKey="pendente" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground) / 0.25)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(var(--muted-foreground))", strokeWidth: 2, stroke: "#fff" }} name="Pendente" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar transação..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Histórico de Transações ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma transação encontrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">R$ {Number(t.amount).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline">{t.type === "payment" ? "Pagamento" : t.type}</Badge></TableCell>
                    <TableCell><Badge variant={t.status === "paid" ? "default" : "secondary"}>{t.status === "paid" ? "Pago" : t.status === "pending" ? "Pendente" : t.status}</Badge></TableCell>
                    <TableCell>{t.description || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFinance;
