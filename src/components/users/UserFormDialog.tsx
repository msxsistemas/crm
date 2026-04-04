import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Users as UsersIcon, Pencil, X, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/db";
import { toast } from "sonner";

const MODULES = [
  { key: "inbox", label: "Caixa de Entrada" },
  { key: "contacts", label: "Contatos" },
  { key: "tasks", label: "Tarefas" },
  { key: "campaigns", label: "Campanhas" },
  { key: "chatbot", label: "Chatbot" },
  { key: "reports", label: "Relatórios" },
  { key: "schedules", label: "Agendamentos" },
  { key: "funnel", label: "Funil de Vendas" },
  { key: "users", label: "Usuários" },
  { key: "settings", label: "Configurações" },
];


interface UserFormData {
  id?: string;
  full_name: string;
  email: string;
  password: string;
  phone_number: string;
  role: string;
  department_id: string;
  default_connection_id: string;
  goodbye_message: string;
  absence_message: string;
  follow_me_enabled: boolean;
  start_time: string;
  end_time: string;
  limited_access: boolean;
  is_inactive: boolean;
  contacts_access: boolean;
  campaigns_access: boolean;
  can_create_tags: boolean;
}

const defaultForm: UserFormData = {
  full_name: "",
  email: "",
  password: "",
  phone_number: "",
  role: "user",
  department_id: "",
  default_connection_id: "",
  goodbye_message: "",
  absence_message: "",
  follow_me_enabled: false,
  start_time: "",
  end_time: "",
  limited_access: false,
  is_inactive: false,
  contacts_access: true,
  campaigns_access: false,
  can_create_tags: false,
};

interface Department { id: string; name: string; }
interface Connection { id: string; label: string; type: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editUserId?: string | null;
  editUserEmail?: string | null;
  onSaved: () => void;
}

const defaultPermissions = (): Record<string, boolean> =>
  Object.fromEntries(MODULES.map(m => [m.key, true]));

const UserFormDialog = ({ open, onOpenChange, editUserId, editUserEmail, onSaved }: Props) => {
  const [form, setForm] = useState<UserFormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [permissions, setPermissions] = useState<Record<string, boolean>>(defaultPermissions());
  const [activeTab, setActiveTab] = useState<"info" | "permissions">("info");
  const isEdit = !!editUserId;

  useEffect(() => {
    if (open) {
      setErrors({});
      setActiveTab("info");
      loadSelectData();
      if (editUserId) {
        loadUser(editUserId);
      } else {
        setForm(defaultForm);
        setPermissions(defaultPermissions());
      }
    }
  }, [open, editUserId]);

  const loadSelectData = async () => {
    const [deptRes, evoRes] = await Promise.all([
      supabase.from("categories").select("id, name"),
      supabase.from("evolution_connections").select("id, instance_name"),
    ]);
    setDepartments((deptRes.data || []) as Department[]);
    const evoConns = (evoRes.data || []).map((c: any) => ({ id: c.id, label: c.instance_name, type: "Evolution" }));
    setConnections(evoConns);
  };

  const loadUser = async (id: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase.from("user_roles").select("role").eq("user_id", id),
    ]);
    const p = profileRes.data as any;
    const role = (roleRes.data as any)?.[0]?.role || "user";
    if (p) {
      setForm({
        id: p.id,
        full_name: p.full_name || "",
        email: editUserEmail || p.email || "",
        password: "",
        phone_number: p.phone_number || "",
        role,
        department_id: p.department_id || "",
        default_connection_id: p.default_connection_id || "",
        goodbye_message: p.goodbye_message || "",
        absence_message: p.absence_message || "",
        follow_me_enabled: p.follow_me_enabled || false,
        start_time: p.start_time || "",
        end_time: p.end_time || "",
        limited_access: p.limited_access || false,
        is_inactive: p.is_inactive || false,
        contacts_access: p.contacts_access ?? true,
        campaigns_access: p.campaigns_access || false,
        can_create_tags: p.can_create_tags || false,
      });
      // Load permissions: if empty/null → all enabled
      const savedPerms = p.permissions as Record<string, boolean> | null;
      if (savedPerms && Object.keys(savedPerms).length > 0) {
        // Merge with defaults so new modules default to true
        setPermissions({ ...defaultPermissions(), ...savedPerms });
      } else {
        setPermissions(defaultPermissions());
      }
    }
  };

  const set = (key: keyof UserFormData, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    if (!form.full_name.trim()) newErrors.full_name = "Obrigatório";
    if (!isEdit && !form.email.trim()) newErrors.email = "Obrigatório";
    if (!isEdit && !form.password.trim()) newErrors.password = "Obrigatório";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const profileData = {
        full_name: form.full_name,
        phone_number: form.phone_number,
        email: form.email,
        default_connection_id: form.default_connection_id || null,
        goodbye_message: form.goodbye_message,
        absence_message: form.absence_message,
        follow_me_enabled: form.follow_me_enabled,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        limited_access: form.limited_access,
        is_inactive: form.is_inactive,
        contacts_access: form.contacts_access,
        campaigns_access: form.campaigns_access,
        can_create_tags: form.can_create_tags,
      } as any;

      if (isEdit && editUserId) {
        await supabase.from("profiles").update({ ...profileData, permissions }).eq("id", editUserId);
        await supabase.from("user_roles").delete().eq("user_id", editUserId);
        if (form.role !== "user") {
          await supabase.from("user_roles").insert({ user_id: editUserId, role: form.role } as any);
        }
        toast.success("Usuário atualizado!");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.full_name } },
        });
        if (error) throw error;

        const newUserId = data.user?.id;
        if (newUserId) {
          setTimeout(async () => {
            await supabase.from("profiles").update({ ...profileData, email: form.email }).eq("id", newUserId);
            if (form.role !== "user") {
              await supabase.from("user_roles").insert({ user_id: newUserId, role: form.role } as any);
            }
          }, 1000);
        }
        toast.success("Usuário criado com sucesso!");
      }

      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar usuário");
    } finally {
      setLoading(false);
    }
  };

  const boolToStr = (v: boolean) => (v ? "SIM" : "NÃO");
  const strToBool = (v: string) => v === "SIM";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
            {isEdit ? <Pencil className="h-5 w-5 text-white" /> : <UsersIcon className="h-5 w-5 text-white" />}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">
              {isEdit ? "Editar Usuário" : "Adicionar usuário"}
            </h2>
            <p className="text-sm text-white/70">
              {isEdit ? "Atualize as informações do usuário" : "Preencha os dados do novo usuário"}
            </p>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs (only when editing) */}
        {isEdit && (
          <div className="flex border-b border-border bg-muted/30">
            <button
              onClick={() => setActiveTab("info")}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${activeTab === "info" ? "border-b-2 border-blue-600 text-blue-600" : "text-muted-foreground hover:text-foreground"}`}
            >
              Informações
            </button>
            <button
              onClick={() => setActiveTab("permissions")}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${activeTab === "permissions" ? "border-b-2 border-blue-600 text-blue-600" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Permissões
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Permissions Tab */}
          {isEdit && activeTab === "permissions" && (
            <div>
              <p className="text-xs text-muted-foreground mb-4">
                Ative ou desative o acesso aos módulos para este usuário. Por padrão, todos os módulos estão habilitados.
              </p>
              <div className="space-y-3">
                {MODULES.map(module => (
                  <div key={module.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-foreground">{module.label}</span>
                    <Switch
                      checked={permissions[module.key] ?? true}
                      onCheckedChange={(checked) =>
                        setPermissions(prev => ({ ...prev, [module.key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Tab (default, or when not editing) */}
          {(!isEdit || activeTab === "info") && (
            <>
          {/* Nome + Senha */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FloatingInput label="Nome" value={form.full_name} onChange={(e) => { set("full_name", e.target.value); setErrors(prev => ({ ...prev, full_name: "" })); }} className={errors.full_name ? "border-destructive focus-visible:border-destructive" : ""} />
              {errors.full_name && <span className="text-xs text-destructive mt-0.5 block">{errors.full_name}</span>}
            </div>
            <div>
              <FloatingInput label={isEdit ? "Nova senha" : "Senha"} type="password" value={form.password} onChange={(e) => { set("password", e.target.value); setErrors(prev => ({ ...prev, password: "" })); }} className={errors.password ? "border-destructive focus-visible:border-destructive" : ""} />
              {errors.password && <span className="text-xs text-destructive mt-0.5 block">{errors.password}</span>}
            </div>
          </div>

          {/* Número */}
          <FloatingInput label="Número" value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} />

          {/* E-Mail + Perfil */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <FloatingInput label="E-Mail" type="email" value={form.email} onChange={(e) => { set("email", e.target.value); setErrors(prev => ({ ...prev, email: "" })); }} disabled={isEdit} className={errors.email ? "border-destructive focus-visible:border-destructive" : ""} />
              {errors.email && <span className="text-xs text-destructive mt-0.5 block">{errors.email}</span>}
            </div>
            <FloatingSelectWrapper label="Perfil" hasValue={!!form.role}>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
          </div>

          {/* Filas */}
          <FloatingSelectWrapper label="Filas" hasValue={!!form.department_id && form.department_id !== "none"}>
            <Select value={form.department_id} onValueChange={(v) => set("department_id", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder=" " /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>

          {/* Conexão Padrão */}
          <FloatingSelectWrapper label="Conexão Padrão" hasValue={!!form.default_connection_id && form.default_connection_id !== "none"}>
            <Select value={form.default_connection_id} onValueChange={(v) => set("default_connection_id", v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder=" " /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label} ({c.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>

          {/* Mensagem de Despedida */}
          <FloatingTextarea label="Mensagem de Despedida" value={form.goodbye_message} onChange={(e) => set("goodbye_message", e.target.value)} rows={2} className="min-h-[60px]" />

          {/* Mensagem de Ausência */}
          <FloatingTextarea label="Mensagem de Ausência" value={form.absence_message} onChange={(e) => set("absence_message", e.target.value)} rows={2} className="min-h-[60px]" />

          {/* Ativar Siga-Me */}
          <FloatingSelectWrapper label="Ativar Siga-Me" hasValue={true}>
            <Select value={boolToStr(form.follow_me_enabled)} onValueChange={(v) => set("follow_me_enabled", strToBool(v))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SIM">SIM</SelectItem>
                <SelectItem value="NÃO">NÃO</SelectItem>
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>

          {/* Hora Inicial / Final */}
          <FloatingInput label="Hora Inicial" type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
          <FloatingInput label="Hora Final" type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />

          {/* Boolean selects */}
          {([
            ["limited_access", "Acesso Limitado"],
            ["is_inactive", "Inativar Usuário"],
            ["contacts_access", "Acesso a Contatos"],
            ["campaigns_access", "Acesso a Campanhas"],
            ["can_create_tags", "Pode Criar Tags no Chat"],
          ] as const).map(([key, label]) => (
            <FloatingSelectWrapper key={key} label={label} hasValue={true}>
              <Select value={boolToStr(form[key as keyof UserFormData] as boolean)} onValueChange={(v) => set(key as keyof UserFormData, strToBool(v))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIM">SIM</SelectItem>
                  <SelectItem value="NÃO">NÃO</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
          ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold uppercase" onClick={handleSubmit} disabled={loading}>
            {isEdit ? "SALVAR" : "ADICIONAR"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserFormDialog;
