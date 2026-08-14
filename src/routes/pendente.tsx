import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogOut } from "lucide-react";
import { SuporteLogo } from "@/components/suporte-logo";
import { useEffect } from "react";

export const Route = createFileRoute("/pendente")({
  head: () => ({
    meta: [
      { title: "Aguardando aprovação — Suporte INFRA" },
      { name: "description", content: "Sua conta aguarda aprovação de um administrador." },
    ],
  }),
  component: PendentePage,
});

function PendentePage() {
  const { profile, user, signOut, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/auth", replace: true });
    else if (profile?.status === "ativo") nav({ to: "/", replace: true });
  }, [user, profile, loading, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <SuporteLogo className="h-12" />
        </div>
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-2 rounded-full bg-primary/10 p-3">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Cadastro em análise</CardTitle>
            <CardDescription>
              Sua conta foi criada, mas ainda precisa ser aprovada por um administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div><span className="text-muted-foreground">Email:</span> {profile?.email}</div>
              <div><span className="text-muted-foreground">Status:</span> Pendente</div>
            </div>
            <Button variant="outline" className="w-full" onClick={async () => { await signOut(); nav({ to: "/auth" }); }}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}