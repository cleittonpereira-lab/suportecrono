/** Cria uma reunião: dados básicos e quem participa (já traz o grupo da última). */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarReuniao } from "@/lib/atas-qualidade.functions";
import { gruposExistentes, proximoNumero, reunioesDoGrupo, type Participante, type Reuniao } from "@/lib/atas-qualidade";
import { isoHoje } from "@/features/lab/hooks/use-acoes-da-programacao";
import { CHAVE_ATAS, usePessoas } from "./atas-hooks";
import { PessoasPicker } from "./PessoasPicker";

export function NovaReuniaoDialog({
  aberto,
  onAbertoChange,
  reunioes,
  grupoInicial,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  reunioes: readonly Reuniao[];
  grupoInicial: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const criarFn = useServerFn(criarReuniao);
  const { data: pessoas = [] } = usePessoas();

  const [grupo, setGrupo] = useState(grupoInicial);
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(isoHoje());
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFim, setHoraFim] = useState("");
  const [local, setLocal] = useState("");
  const [pauta, setPauta] = useState("");
  // null = ainda não mexeu: usa os participantes da última reunião do grupo.
  const [escolhidos, setEscolhidos] = useState<string[] | null>(null);

  const doGrupo = useMemo(() => reunioesDoGrupo(reunioes, grupo.trim()), [reunioes, grupo]);
  const ultima = doGrupo[doGrupo.length - 1] ?? null;
  const participantes: string[] = escolhidos ?? ultima?.participantes.map((p) => p.nome) ?? [];
  const externos = new Set((ultima?.participantes ?? []).filter((p) => p.externo).map((p) => p.nome.toLowerCase()));
  const numero = proximoNumero(reunioes, grupo.trim() || grupoInicial);

  const criar = useMutation({
    mutationFn: () => {
      const lista: Participante[] = participantes.map((nome) => {
        const conta = pessoas.some((p) => p.nome.toLowerCase() === nome.toLowerCase());
        const anterior = ultima?.participantes.find((p) => p.nome.toLowerCase() === nome.toLowerCase());
        return { nome, presente: true, funcao: anterior?.funcao ?? "", externo: !conta && (anterior ? anterior.externo : true) };
      });
      return criarFn({
        data: { grupo: grupo.trim(), titulo: titulo.trim(), data, horaInicio, horaFim, local, pauta, participantes: lista },
      });
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: CHAVE_ATAS });
      onAbertoChange(false);
      void navigate({ to: "/qualidade/atas/$reuniaoId", params: { reuniaoId: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova reunião</DialogTitle>
          <DialogDescription>
            Será a reunião nº {numero} deste grupo. Os participantes da última reunião já vêm marcados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ata-grupo">Grupo</Label>
            <Input id="ata-grupo" list="ata-grupos" value={grupo} onChange={(e) => { setGrupo(e.target.value); setEscolhidos(null); }} />
            <datalist id="ata-grupos">
              {gruposExistentes(reunioes).map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ata-titulo">Título (opcional)</Label>
            <Input id="ata-titulo" value={titulo} placeholder={`Reunião nº ${numero}`} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 grid gap-1.5 sm:col-span-1">
              <Label htmlFor="ata-data">Data</Label>
              <Input id="ata-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ata-hi">Início</Label>
              <Input id="ata-hi" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ata-hf">Término</Label>
              <Input id="ata-hf" type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ata-local">Local</Label>
            <Input id="ata-local" value={local} placeholder="Sala de reuniões, Teams, Meet…" onChange={(e) => setLocal(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ata-pauta">Pauta (opcional)</Label>
            <Textarea id="ata-pauta" rows={3} value={pauta} onChange={(e) => setPauta(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Participantes ({participantes.length})</Label>
              <PessoasPicker value={participantes} opcoes={pessoas} onChange={setEscolhidos}>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> Adicionar / remover
                </Button>
              </PessoasPicker>
            </div>
            <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border p-2">
              {participantes.length === 0 && <span className="text-sm text-muted-foreground">Ninguém ainda.</span>}
              {participantes.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                  {n}
                  {externos.has(n.toLowerCase()) && <span className="text-muted-foreground">(externo)</span>}
                  <button
                    type="button"
                    aria-label={`Remover ${n}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEscolhidos(participantes.filter((x) => x !== n))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending || !grupo.trim() || !data} className="gap-1.5">
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar reunião
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
