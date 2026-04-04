import { useState } from "react";
import { usePlatformName } from "@/hooks/usePlatformName";
import { supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Loader2, Mail, Lock, Eye, EyeOff, User, Phone } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const Register = () => {
  const { platformName } = usePlatformName();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta criada com sucesso!");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary p-4">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary-foreground/30">
          <MessageCircle className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-primary-foreground">
          {platformName}
        </h1>
        <p className="text-primary-foreground/80">Crie sua conta para começar</p>
      </div>

      {/* Steps indicator */}
      <div className="mb-4 flex items-center gap-6 text-sm text-primary-foreground/80">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-xs font-bold text-primary">
            1
          </span>
          Seus dados
        </span>
        <span className="flex items-center gap-2 opacity-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-primary-foreground/50 text-xs font-bold">
            2
          </span>
          Plano
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold text-gray-700">
              Nome completo
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="name"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                required
                maxLength={100}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-semibold text-gray-700">
              Telefone
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="phone"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                maxLength={20}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                required
                maxLength={255}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
              Senha
            </Label>
            <p className="text-xs text-gray-400">Mín. 8 caracteres, com maiúscula, minúscula e número</p>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 pr-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-sm font-semibold text-gray-700">
              Confirmar senha
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 pr-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full text-base font-semibold" size="lg" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continuar →
          </Button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-6 text-sm text-primary-foreground/80">
        Já tem uma conta?{" "}
        <Link to="/login" className="font-semibold text-primary-foreground hover:underline">
          Fazer login
        </Link>
      </p>
    </div>
  );
};

export default Register;
