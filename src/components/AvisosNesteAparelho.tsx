/**
 * Cartão "Avisos neste aparelho" (página Meu perfil): liga/desliga os avisos
 * do fluxo de aprovação neste navegador e manda um aviso de teste.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ativarAvisos, desativarAvisos, situacaoAvisos, type SituacaoAvisos } from "@/lib/avisos-cliente";
import { enviarAvisoDeTeste, situacaoDosAvisos } from "@/lib/avisos.functions";

const ROTULO: Record<SituacaoAvisos, string> = {
  "sem-suporte": "Este navegador não recebe avisos",
  bloqueado: "Bloqueado nas configurações do navegador",
  desligado: "Desligados neste aparelho",
  ligado: "Ligados neste aparelho",
};

export function AvisosNesteAparelho() {
  const situacaoServidorFn = useServerFn(situacaoDosAvisos);
  const testeFn = useServerFn(enviarAvisoDeTeste);
  const [situacao, setSituacao] = useState<SituacaoAvisos | null>(null);
  const [servidorPronto, setServidorPronto] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void situacaoAvisos().then(setSituacao).catch(() => setSituacao("sem-suporte"));
    void situacaoServidorFn()
      .then((s) => setServidorPronto(s.configurado))
      .catch(() => setServidorPronto(null));
  }, [situacaoServidorFn]);

  const executar = async (acao: () => Promise<SituacaoAvisos>, sucesso: string) => {
    setOcupado(true);
    try {
      const nova = await acao();
      setSituacao(nova);
      if (nova === "ligado" || nova === "desligado") toast.success(sucesso);
      else if (nova === "bloqueado") toast.error("O navegador bloqueou as notificações deste site. Libere nas configurações e tente de novo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const testar = async () => {
    setOcupado(true);
    try {
      await testeFn();
      toast.success("Aviso de teste enviado — deve chegar em alguns segundos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Avisos neste aparelho
        </CardTitle>
        <CardDescription>
          Notificação quando um laudo espera a sua verificação ou aprovação, ou quando um laudo que você enviou volta para correção —
          mesmo com o app fechado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {situacao ? (
            <Badge variant={situacao === "ligado" ? "default" : "outline"}>{ROTULO[situacao]}</Badge>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {servidorPronto === false && <Badge variant="destructive">Servidor ainda sem a chave dos avisos</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {situacao === "ligado" ? (
            <>
              <Button variant="outline" onClick={() => void executar(desativarAvisos, "Avisos desligados neste aparelho.")} disabled={ocupado}>
                <BellOff className="mr-2 h-4 w-4" /> Desligar
              </Button>
              <Button onClick={() => void testar()} disabled={ocupado || servidorPronto === false}>
                {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar aviso de teste
              </Button>
            </>
          ) : (
            <Button
              onClick={() => void executar(ativarAvisos, "Avisos ligados neste aparelho.")}
              disabled={ocupado || situacao === "sem-suporte" || situacao === "bloqueado"}
            >
              {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Ligar avisos neste aparelho
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          No iPhone, os avisos só funcionam com o app instalado na tela de início (Compartilhar → Adicionar à Tela de Início), com iOS 16.4
          ou mais novo. Cada aparelho é ligado separadamente.
        </p>
      </CardContent>
    </Card>
  );
}
