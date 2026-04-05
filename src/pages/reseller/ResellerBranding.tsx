import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save } from "lucide-react";

const ResellerBranding = () => {
  const { user } = useAuth();
  const [account, setAccount] = useState<any>(null);
  const [branding, setBranding] = useState({ company_name: "", primary_color: "#7C3AED", logo_url: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadAccount();
  }, [user]);

  const loadAccount = async () => {
    setLoading(true);
    const { data: acc } = await db.from("reseller_accounts").select("*").eq("user_id", user!.id).single();
    setAccount(acc);
    if (acc) {
      setBranding({
        company_name: acc.company_name || "",
        primary_color: acc.primary_color || "#7C3AED",
        logo_url: acc.logo_url || "",
      });
    }
    setLoading(false);
  };

  const saveBranding = async () => {
    if (!account) return;
    const { error } = await db.from("reseller_accounts").update({
      company_name: branding.company_name,
      primary_color: branding.primary_color,
      logo_url: branding.logo_url,
      updated_at: new Date().toISOString(),
    }).eq("id", account.id);
    if (error) return toast.error(error.message);
    toast.success("Marca atualizada!");
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6"><p className="text-muted-foreground">Conta de revendedor não encontrada.</p></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Minha Marca</h1>
        <p className="text-muted-foreground">Personalize a identidade visual da sua revenda (White-Label)</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Personalizar Marca</CardTitle></CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div>
            <Label>Nome da Empresa</Label>
            <Input value={branding.company_name} onChange={e => setBranding(b => ({ ...b, company_name: e.target.value }))} placeholder="Nome da sua marca" />
          </div>
          <div>
            <Label>URL do Logo</Label>
            <Input value={branding.logo_url} onChange={e => setBranding(b => ({ ...b, logo_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div>
            <Label>Cor Principal</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={branding.primary_color} onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))} className="h-10 w-16 rounded border cursor-pointer" />
              <Input value={branding.primary_color} onChange={e => setBranding(b => ({ ...b, primary_color: e.target.value }))} className="max-w-32" />
              <div className="h-10 w-10 rounded-lg border" style={{ background: branding.primary_color }} />
            </div>
          </div>
          {branding.logo_url && (
            <div>
              <Label>Preview do Logo</Label>
              <div className="mt-2 p-4 rounded-lg border bg-muted/50 inline-block">
                <img src={branding.logo_url} alt="Logo" className="h-16 max-w-48 object-contain" />
              </div>
            </div>
          )}
          <Button onClick={saveBranding}><Save className="h-4 w-4 mr-1" />Salvar Marca</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResellerBranding;
