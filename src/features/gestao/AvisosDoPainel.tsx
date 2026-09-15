/**
 * "Avisos no celular" do Painel do coordenador: cada pessoa liga ou desliga o
 * resumo da manhã e o aviso de entrega em risco, ativa este aparelho e pode
 * pedir o resumo na hora para ver como chega.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AvisosNesteAparelho } from "@/components/AvisosNesteAparelho";
import {
  minhasPreferenciasDoPainel,
  receberResumoAgora,
  salvarMinhasPreferenciasDoPainel,
} from "@/lib/painel-avisos.functions";
import type { Preferencias } from "@/lib/painel-avisos-logica";

const CHAVE = ["painel-avisos-preferencias"];

export function AvisosDoPainel() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const lerFn = useServerFn(minhasPreferenciasDoPainel);
  const salvarFn = useServerFn(salvarMinhasPreferenciasDoPainel);
  const resumoFn = useServerFn(receberResumoAgora);

  const prefs = useQuery({ queryKey: CHAVE, queryFn: () => lerFn(), enabled: aberto });
  const salvar = useMutation({
    mutationFn: (p: Preferencias) => salvarFn({ data: p }),
    onSuccess: (p) => {
      qc.setQueryData(CHAVE, p);
      toast.success("Preferência salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resumo = useMutation({
    mutationFn: () => resumoFn(),
    onSuccess: (r) => {
      if (r.enviado) toast.success(`Resumo enviado para ${r.aparelhos} aparelho(s). Chega em instantes.`);
      else toast.info(`Nenhum aparelho seu recebe avisos — ative logo abaixo. Prévia: ${r.previa}`, { duration: 9000 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = prefs.data;
  const mudar = (campo: keyof Preferencias, valor: boolean) => p && salvar.mutate({ ...p, [campo]: valor });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BellRing className="h-4 w-4" /> Avisos no celular
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Avisos do painel no celular</DialogTitle>
          <DialogDescription>
            Para administradores e quem tem o Painel do coordenador. Chegam no celular mesmo com o app fechado.
          </DialogDescription>
        </DialogHeader>

        {prefs.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : prefs.error ? (
          <p className="text-sm text-destructive">{(prefs.error as Error).message}</p>
        ) : p ? (
          <div className="space-y-4">
            <label htmlFor="aviso-resumo" className="flex items-start gap-3 cursor-pointer">
              <Switch id="aviso-resumo" checked={p.resumo} onCheckedChange={(v) => mudar("resumo", v)} disabled={salvar.isPending} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Resumo da manhã</span>
                <span className="block text-xs text-muted-foreground">
                  Dias úteis, às 7h: entregas atrasadas e em risco, laudos parados, ensaios sem programação e o gargalo do dia.
                </span>
              </span>
            </label>
            <label htmlFor="aviso-risco" className="flex items-start gap-3 cursor-pointer">
              <Switch id="aviso-risco" checked={p.risco} onCheckedChange={(v) => mudar("risco", v)} disabled={salvar.isPending} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Entrega em risco ou atrasada</span>
                <span className="block text-xs text-muted-foreground">
                  Na hora em que uma OS entra em risco ou atrasa — dias úteis, das 7h às 19h. Uma vez por mudança, sem repetir.
                </span>
              </span>
            </label>

            <div className="border-t pt-3">
              <AvisosNesteAparelho />
            </div>

            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => resumo.mutate()} disabled={resumo.isPending}>
              {resumo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Receber o resumo agora
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
