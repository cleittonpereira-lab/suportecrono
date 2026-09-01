import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, LogIn, UserPlus, Eye, Lock, Mail, User as UserIcon } from "lucide-react";
import { loginWithPassword, loginWithGoogle, signUpSelf } from "@/lib/auth.functions";
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

function UnifiedSignInForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const loginFn = useServerFn(loginWithPassword);

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
    const tid = toast.loading("Autenticando…");
    try {
      const { user } = await loginFn({ data: { identifier: idf, password } });
      if (user.status === "pendente") {
        toast.info("Cadastro criado! Aguarde a aprovação do administrador.", { id: tid });
        window.location.replace("/pendente");
        return;
      }
      toast.success("Login realizado com sucesso! ✓", { id: tid });
      window.location.replace("/entregas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao efetuar login.", { id: tid });
    } finally {
      setLoading(false);
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
            placeholder="ex.: bianca.bueno ou seu.nome@suportesolos.com.br"
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

/** Carrega dinamicamente a biblioteca oficial do Google Identity Services */
function loadGoogleGsi(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as any).google?.accounts?.oauth2) {
      return resolve(true);
    }
    const existing = document.querySelector("script[src='https://accounts.google.com/gsi/client']");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const googleLoginFn = useServerFn(loginWithGoogle);

  const onClick = async () => {
    setLoading(true);
    const tid = toast.loading("Iniciando seleção de conta Google…");

    try {
      const gsiReady = await loadGoogleGsi();
      const googleClientId =
        (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
        "112017692174156672577-web.apps.googleusercontent.com";

      if (!gsiReady || !(window as any).google?.accounts?.oauth2) {
        setLoading(false);
        toast.error("Não foi possível abrir o Google.", { id: tid });
        return;
      }

      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "openid email profile",
        prompt: "select_account",
        callback: async (tokenResponse: any) => {
          if (!tokenResponse?.access_token) {
            setLoading(false);
            toast.dismiss(tid);
            return;
          }
          try {
            const { user } = await googleLoginFn({ data: { accessToken: tokenResponse.access_token } });
            if (user.status === "pendente") {
              toast.info("Cadastro criado! Aguarde a aprovação do administrador.", { id: tid });
              window.location.replace("/pendente");
              return;
            }
            toast.success(`Autenticado como ${user.email}! ✓`, { id: tid });
            window.location.replace("/entregas");
          } catch (err) {
            setLoading(false);
            toast.error(err instanceof Error ? err.message : "Não foi possível entrar com o Google.", { id: tid });
          }
        },
        error_callback: () => {
          setLoading(false);
          toast.dismiss(tid);
        },
      });

      client.requestAccessToken({ prompt: "select_account" });
    } catch (e) {
      setLoading(false);
      toast.error("Não foi possível abrir o Google.", { id: tid });
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
  const signUpFn = useServerFn(signUpSelf);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      toast.error("Informe um endereço de e-mail válido.");
      return;
    }
    setLoading(true);
    try {
      const { user } = await signUpFn({ data: { nome, email: cleanEmail, password } });
      setLoading(false);
      if (user.status === "pendente") {
        toast.success("Cadastro realizado com sucesso! Aguarde a aprovação do administrador.");
        window.location.replace("/pendente");
        return;
      }
      toast.success("Cadastro realizado com sucesso! ✓");
      window.location.replace("/entregas");
    } catch (err) {
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="space-y-1.5">
        <Label htmlFor="su-nome" className="text-xs font-semibold">Nome completo</Label>
        <div className="relative">
          <Input
            id="su-nome"
            required
            placeholder="Seu nome completo"
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
        Após o cadastro, seu acesso será liberado para a gestão e relatórios do laboratório.
      </p>
    </form>
  );
}
