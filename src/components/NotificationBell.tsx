/**
 * Sino de notificações no cabeçalho: mostra a caixa de avisos da pessoa
 * (laudo aguardando verificação/aprovação, devolvido para correção — mesmo
 * texto e URL que o push já usa, ver lib/avisos-logica.ts) com contador de
 * não lidos e clique leva direto pro laudo. Complementa o push (que depende
 * de permissão do navegador e só chega se o aparelho estiver com o app
 * instalado) com uma lista sempre disponível dentro do app.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { minhaCaixaDeAvisos, marcarAvisosLidos } from "@/lib/avisos.functions";
import { useAuth } from "@/hooks/use-auth";
import { aoMudar } from "@/lib/tempo-real";

const QUERY_KEY = ["meus-avisos"];

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const marcandoRef = useRef(false);

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => minhaCaixaDeAvisos(),
    refetchInterval: 45_000,
    enabled: !!user?.id,
  });

  // Atualiza na hora quando um aviso novo chega nesta conta, sem esperar o
  // próximo refetchInterval — mesmo padrão de useVersoesAoVivo.
  useEffect(() => {
    if (!user?.id) return;
    const nomeArquivo = `caixa-${user.id}.json`;
    return aoMudar((docs) => {
      if (!docs.some((d) => d.pasta === "avisos" && d.nome === nomeArquivo)) return;
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const avisos = data?.avisos ?? [];
  const lidoAte = data?.lidoAte ?? null;
  const naoLidos = useMemo(
    () => avisos.filter((a) => !lidoAte || a.criadoEm > lidoAte).length,
    [avisos, lidoAte],
  );

  async function marcarComoLido() {
    if (marcandoRef.current || avisos.length === 0) return;
    const maisNovo = avisos[0]?.criadoEm;
    if (!maisNovo || (lidoAte && lidoAte >= maisNovo)) return;
    marcandoRef.current = true;
    qc.setQueryData(QUERY_KEY, (atual: typeof data) => (atual ? { ...atual, lidoAte: maisNovo } : atual));
    try {
      await marcarAvisosLidos({ data: { ate: maisNovo } });
    } catch {
      // silencioso: o contador volta a aparecer no próximo refetch, sem prejuízo
    } finally {
      marcandoRef.current = false;
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void marcarComoLido();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Notificações"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
          {naoLidos > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
              {naoLidos > 9 ? "9+" : naoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">Notificações</div>
        {avisos.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma notificação por enquanto.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {avisos.map((a) => {
              const naoLido = !lidoAte || a.criadoEm > lidoAte;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: a.url });
                  }}
                  className={`block w-full border-b px-3 py-2.5 text-left text-xs last:border-b-0 hover:bg-muted/60 ${
                    naoLido ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {naoLido && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground">{a.titulo}</div>
                      <div className="mt-0.5 text-muted-foreground line-clamp-2">{a.corpo}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        {formatDistanceToNow(new Date(a.criadoEm), { addSuffix: true, locale: ptBR })}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
