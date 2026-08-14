import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, LogIn, UserPlus, Eye } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { SuporteLogo } from "@/components/suporte-logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Suporte INFRA" },
      { name: "description", content: "Acesse a plataforma de gestão do laboratório Suporte INFRA." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { user, profile, enterGuest, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      if (profile?.status === "pendente") nav({ to: "/pendente", replace: true });
      else if (profile?.status !== "bloqueado") nav({ to: "/entregas", replace: true });
    }
  }, [user, profile, loading, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <SuporteLogo className="h-12" />
          <p className="text-sm text-muted-foreground">Gestão de Ordens de Serviço</p>
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Acessar sistema</CardTitle>
            <CardDescription>Entre com sua conta ou continue como convidado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4"><SignInTabs /></TabsContent>
              <TabsContent value="signup" className="mt-4"><SignUpForm /></TabsContent>
            </Tabs>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>
            <GoogleButton />
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                enterGuest();
                nav({ to: "/entregas" });
              }}
            >
              <Eye className="mr-2 h-4 w-4" /> Entrar sem login
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground text-center">
              Modo convidado tem acesso a todas as abas, exceto Gestão de Usuários.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
        extraParams: { hd: "suportesolos.com.br", prompt: "select_account" },
      });
      if (result?.error) {
        const msg = String(result.error?.message || result.error);
        if (/suportesolos/i.test(msg) || /domain/i.test(msg) || /hd/i.test(msg)) {
          toast.error("Apenas contas @suportesolos.com.br podem entrar.");
        } else {
          toast.error("Não foi possível entrar com Google. Tente novamente.");
        }
      }
    } catch (e) {
      toast.error("Não foi possível entrar com Google.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="outline" className="w-full" onClick={onClick} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.68 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.15.8 3.87 1.5l2.64-2.55C16.9 3.3 14.7 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.6S6.9 20.9 12 20.9c6.9 0 9.4-4.8 9.4-7.4 0-.5-.05-.9-.13-1.3H12z"/>
          </svg>
          Entrar com Google
        </>
      )}
    </Button>
  );
}

function friendlySignInError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "Senha incorreta ou usuário não cadastrado.";
  }
  if (m.includes("email not confirmed")) {
    return "Email ainda não confirmado. Verifique sua caixa de entrada.";
  }
  if (m.includes("user not found")) {
    return "Usuário não cadastrado. Crie uma conta na aba Cadastrar.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas. Aguarde um momento e tente novamente.";
  }
  return msg;
}

function friendlySignUpError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("suportesolos")) {
    return "Cadastro permitido apenas para emails @suportesolos.com.br.";
  }
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already")) {
    return "Este email já está cadastrado. Faça login.";
  }
  if (m.includes("password") && m.includes("6")) {
    return "Senha deve ter pelo menos 6 caracteres.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Email inválido.";
  }
  return msg;
}

function SignInTabs() {
  return (
    <Tabs defaultValue="email">
      <TabsList className="grid grid-cols-2 w-full h-8">
        <TabsTrigger value="email" className="text-xs">E-mail</TabsTrigger>
        <TabsTrigger value="username" className="text-xs">Usuário</TabsTrigger>
      </TabsList>
      <TabsContent value="email" className="mt-3"><SignInForm /></TabsContent>
      <TabsContent value="username" className="mt-3"><SignInUsernameForm /></TabsContent>
    </Tabs>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(friendlySignInError(error.message));
      return;
    }
    toast.success("Login realizado.");
    // Aguarda o listener carregar o perfil e o useEffect redirecionar
    setTimeout(() => nav({ to: "/entregas" }), 100);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-pass">Senha</Label>
        <Input id="si-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="mr-2 h-4 w-4" /> Entrar</>}
      </Button>
    </form>
  );
}

function SignInUsernameForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uname = username.trim().toLowerCase().replace(/^@+/, "");
    if (!uname) return;
    setLoading(true);
    // 1) resolve o e-mail pelo username (RPC pública)
    const { data: email, error: rpcErr } = await supabase.rpc("resolve_email_by_username", {
      _username: uname,
    });
    if (rpcErr) {
      setLoading(false);
      toast.error("Não foi possível verificar o usuário. Tente novamente.");
      return;
    }
    if (!email) {
      setLoading(false);
      toast.error("Usuário não encontrado.");
      return;
    }
    // 2) login normal com o e-mail retornado
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(friendlySignInError(error.message));
      return;
    }
    toast.success("Login realizado.");
    setTimeout(() => nav({ to: "/entregas" }), 100);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="si-user">Usuário</Label>
        <Input
          id="si-user"
          required
          autoCapitalize="none"
          autoComplete="username"
          placeholder="ex.: cleitton.pereira"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="si-user-pass">Senha</Label>
        <Input
          id="si-user-pass"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="mr-2 h-4 w-4" /> Entrar</>}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        O nome de usuário é definido pelo administrador na tela de Gestão de usuários.
      </p>
    </form>
  );
}

function SignUpForm() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (!/@suportesolos\.com\.br$/i.test(email.trim())) {
      toast.error("Cadastro permitido apenas para emails @suportesolos.com.br.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      setLoading(false);
      toast.error(friendlySignUpError(error.message));
      return;
    }
    // Auto-login (confirmação de email está desativada no projeto)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) {
      toast.success("Cadastro enviado! Faça login para continuar.");
      return;
    }
    toast.success("Cadastro realizado! Aguarde aprovação de um administrador.");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="su-nome">Nome completo</Label>
        <Input id="su-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-pass">Senha (mín. 6)</Label>
        <Input id="su-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-2 h-4 w-4" /> Cadastrar</>}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Após o cadastro, um administrador precisa aprovar seu acesso.
      </p>
    </form>
  );
}