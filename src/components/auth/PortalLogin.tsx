import { useState } from "react";
import { usePlatformName } from "@/hooks/usePlatformName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import api from "@/lib/api";

interface PortalLoginProps {
  portal: "user" | "admin" | "reseller";
  title: string;
  subtitle: string;
  showRegisterLink?: boolean;
}

const PortalLogin = ({ portal, title, subtitle, showRegisterLink = false }: PortalLoginProps) => {
  const { platformName } = usePlatformName();
  const { session, loading: authLoading, refreshUser } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (authLoading || (session && roleLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authLoading && session) {
    const redirectTo = isAdmin ? "/admin" : "/";
    return <Navigate to={redirectTo} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<{ token: string; refreshToken: string }>('/auth/login', { email, password });
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      await refreshUser();
      toast.success("Login realizado com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login";
      toast.error(msg === "Credenciais inválidas" ? "Email ou senha incorretos" : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary p-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary-foreground/30">
          <MessageCircle className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-primary-foreground">
          {platformName}
        </h1>
        <p className="text-primary-foreground/80">{title}</p>
        <p className="text-sm text-primary-foreground/70">{subtitle}</p>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-foreground">
              Senha
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full text-base font-semibold" size="lg" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </div>

      <div className="mt-6 text-center text-sm text-primary-foreground/80">
        {showRegisterLink ? (
          <p>
            Não tem uma conta?{" "}
            <Link to="/register" className="font-semibold text-primary-foreground hover:underline">
              Criar conta
            </Link>
          </p>
        ) : (
          <p>
            Entrar como usuário comum?{" "}
            <Link to="/login" className="font-semibold text-primary-foreground hover:underline">
              Ir para login padrão
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default PortalLogin;
