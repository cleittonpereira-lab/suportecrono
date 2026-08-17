import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, LogIn, UserPlus, Eye, Lock, Mail, User as UserIcon } from "lucide-react";
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
  const { user, profile, enterGuest, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      if (profile?.status === "pendente") {
        window.location.replace("/pendente");
      } else if (profile?.status !== "bloqueado") {
        window.location.replace("/entregas");
      }
    }
  }, [user, profile, loading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <SuporteLogo className="h-12" />
          <p className="text-sm text-muted-foreground">Gestão de Ordens de Serviço</p>
        </div>
        <Card className="shadow-lg border-border/80">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-bold tracking-tight">Acessar sistema</CardTitle>
            <CardDescription>Entre com sua conta corporativa ou continue como convidado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <UnifiedSignInForm />
              </TabsContent>
              <TabsContent value="signup">
                <SignUpForm />
              </TabsContent>
            </Tabs>
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground font-medium">ou</span>
              </div>
            </div>
            <GoogleButton />
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                enterGuest();
                window.location.replace("/entregas");
              }}
            >
              <Eye className="mr-2 h-4 w-4" /> Entrar sem login
            </Button>
            <p className="mt-2.5 text-[11px] text-muted-foreground text-center">
              Modo convidado tem acesso de visualização a todas as abas do sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Resolve um identificador digitado (seja e-mail completo ou nome de usuário) para o e-mail real da conta */
async function resolveLoginEmail(rawIdentifier: string): Promise<string> {
  const input = rawIdentifier.trim().toLowerCase();
  if (!input) return "";

  // Se já contém '@', é um e-mail direto
  if (input.includes("@")) {
    return input;
  }

  const uname = input.replace(/^@+/, "");
  if (!uname) return "";

  // 1) Tenta resolver via RPC resolve_email_by_username
  try {
    const { data: email, error } = await supabase.rpc("resolve_email_by_username", {
      _username: uname,
    });
    if (!error && email) {
      return email;
    }
  } catch (err) {
    console.warn("RPC resolve_email_by_username falhou, tentando fallback", err);
  }

  // 2) Tenta buscar no profiles diretamente por email prefix ou username
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .or(`username.eq.${uname},email.ilike.${uname}@%`)
      .limit(1)
      .maybeSingle();
    if (profile?.email) {
      return profile.email;
    }
  } catch (err) {
    console.warn("Busca em profiles falhou, tentando fallback de domínio", err);
  }

  // 3) Fallback padrão corporativo Suporte Solos
  return `${uname}@suportesolos.com.br`;
}

function UnifiedSignInForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const idf = identifier.trim();
    if (!idf) {
      toast.error("Informe seu e-mail ou nome de usuário.");
      return;
    }
    if (!password) {
      toast.error("Informe sua senha.");
      return;
    }

    setLoading(true);
    try {
      // Resolve usuário ou e-mail (ex.: bianca.bueno -> bianca.bueno@suportesolos.com.br)
      const email = await resolveLoginEmail(idf);
      if (!email) {
        setLoading(false);
        toast.error("Não foi possível identificar o usuário. Verifique os dados digitados.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        toast.error(friendlySignInError(error.message));
        return;
      }

      // Verifica status do perfil
      if (data.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("status")
          .eq("id", data.user.id)
          .maybeSingle();

        if (prof?.status === "pendente") {
          setLoading(false);
          toast.info("Cadastro criado! Aguarde a aprovação do administrador para liberar seu acesso completo.");
          window.location.replace("/pendente");
          return;
        }

        if (prof?.status === "bloqueado") {
          await supabase.auth.signOut();
          setLoading(false);
          toast.error("Sua conta está bloqueada pelo administrador.");
          return;
        }
      }

      toast.success("Login realizado com sucesso!");
      window.location.replace("/entregas");
    } catch (err: any) {
      setLoading(false);
      toast.error(friendlySignInError(err?.message || "Erro ao efetuar login."));
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="space-y-1.5">
        <Label htmlFor="si-id" className="text-xs font-semibold">
          E-mail ou Usuário
        </Label>
        <div className="relative">
          <Input
            id="si-id"
            type="text"
            required
            autoCapitalize="none"
            autoComplete="username"
            placeholder="ex.: bianca.bueno ou bianca.bueno@suportesolos.com.br"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
          <UserIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="si-pass" className="text-xs font-semibold">
          Senha
        </Label>
        <div className="relative">
          <Input
            id="si-pass"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Sua senha cadastrada"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <Button type="submit" className="w-full h-9 text-xs font-semibold mt-1" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="mr-2 h-4 w-4" /> Entrar</>}
      </Button>
    </form>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    const redirectTo = `${window.location.origin}/auth`;
    try {
      // 1. Tenta direct Supabase signInWithOAuth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            hd: "suportesolos.com.br",
            prompt: "select_account",
          },
        },
      });

      if (error) {
        // 2. Se Supabase falhar, tenta via lovable cloud auth wrapper
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: redirectTo,
          extraParams: { hd: "suportesolos.com.br", prompt: "select_account" },
        });

        if (result?.error) {
          throw result.error;
        }
      }
    } catch (e: any) {
      console.error("Erro no login Google:", e);
      const msg = String(e?.message || e);
      if (/suportesolos/i.test(msg) || /domain/i.test(msg) || /hd/i.test(msg)) {
        toast.error("Apenas contas @suportesolos.com.br podem entrar.");
      } else {
        toast.error("Não foi possível conectar com o Google. Use seu usuário ou e-mail corporativo com senha.");
      }
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
    const cleanEmail = email.trim().toLowerCase();
    if (!/@suportesolos\.com\.br$/i.test(cleanEmail)) {
      toast.error("Cadastro permitido apenas para emails @suportesolos.com.br.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { nome, username: cleanEmail.split("@")[0] },
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      setLoading(false);
      toast.error(friendlySignUpError(error.message));
      return;
    }
    // Auto-login após cadastro
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setLoading(false);
    if (signInErr) {
      toast.success("Cadastro enviado com sucesso! Faça login para continuar.");
      return;
    }
    toast.success("Cadastro realizado! Aguarde a liberação de um administrador.");
    window.location.replace("/pendente");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="space-y-1.5">
        <Label htmlFor="su-nome" className="text-xs font-semibold">Nome completo</Label>
        <div className="relative">
          <Input
            id="su-nome"
            required
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
          <UserIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="su-email" className="text-xs font-semibold">E-mail corporativo</Label>
        <div className="relative">
          <Input
            id="su-email"
            type="email"
            required
            placeholder="nome.sobrenome@suportesolos.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="su-pass" className="text-xs font-semibold">Senha (mínimo 6 dígitos)</Label>
        <div className="relative">
          <Input
            id="su-pass"
            type="password"
            required
            placeholder="Crie sua senha segura"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <Button type="submit" className="w-full h-9 text-xs font-semibold mt-1" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-2 h-4 w-4" /> Cadastrar</>}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        Após o cadastro, um administrador aprovará o seu perfil no painel de gestão.
      </p>
    </form>
  );
}

function friendlySignInError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "Senha incorreta ou usuário/e-mail não cadastrado.";
  }
  if (m.includes("email not confirmed")) {
    return "Email ainda não confirmado. Verifique sua caixa de entrada.";
  }
  if (m.includes("user not found")) {
    return "Usuário não encontrado. Cadastre-se na aba Cadastrar.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  }
  return msg;
}

function friendlySignUpError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("suportesolos")) {
    return "Cadastro permitido apenas para emails @suportesolos.com.br.";
  }
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already")) {
    return "Este email já está cadastrado. Faça login na aba Entrar.";
  }
  if (m.includes("password") && m.includes("6")) {
    return "Senha deve ter pelo menos 6 caracteres.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Email inválido.";
  }
  return msg;
}