/** Peças visuais compartilhadas pelas telas de atas. */
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STATUS_PILL, type StatusKey } from "@/lib/status-tokens";
import {
  iniciais,
  itemAtrasado,
  STATUS_ITEM_LABEL,
  type ItemAta,
  type StatusItem,
  type StatusReuniao,
} from "@/lib/atas-qualidade";

/** Classe do "pill" de cada situação (mesmas cores do resto do app). */
export function pillDoItem(item: Pick<ItemAta, "tipo" | "status" | "prazo">, hoje: string): string {
  if (itemAtrasado(item, hoje)) return STATUS_PILL.atrasado;
  const chave: Record<StatusItem, StatusKey> = {
    pendente: "pendente",
    em_andamento: "execucao",
    concluida: "concluido",
    cancelada: "pendente",
    transferida: "programado",
  };
  return STATUS_PILL[chave[item.status]];
}

export function pillDaReuniao(s: StatusReuniao): string {
  return STATUS_PILL[s === "encerrada" ? "concluido" : s === "em_andamento" ? "execucao" : "programado"];
}

const STATUS_ESCOLHAVEIS: StatusItem[] = ["pendente", "em_andamento", "concluida", "cancelada"];

/** Situação do item como no Monday: a "pílula" colorida é o próprio seletor. */
export function StatusDoItem({
  item,
  hoje,
  onChange,
  disabled,
}: {
  item: ItemAta;
  hoje: string;
  onChange: (s: StatusItem) => void;
  disabled?: boolean;
}) {
  // Transferida não se escolhe à mão: acontece ao trazer para outra reunião.
  if (item.status === "transferida") {
    return <span className={cn(pillDoItem(item, hoje), "whitespace-nowrap")}>{STATUS_ITEM_LABEL.transferida}</span>;
  }
  const atrasado = itemAtrasado(item, hoje);
  return (
    <Select value={item.status} onValueChange={(v) => onChange(v as StatusItem)} disabled={disabled}>
      <SelectTrigger
        className={cn(
          pillDoItem(item, hoje),
          "h-7 w-auto min-w-[8.5rem] gap-1.5 border-0 px-2.5 text-xs font-semibold shadow-none focus:ring-1",
        )}
        aria-label="Situação do item"
      >
        <SelectValue>{atrasado ? "Atrasada" : STATUS_ITEM_LABEL[item.status]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_ESCOLHAVEIS.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_ITEM_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Bolinhas com as iniciais, como na coluna "Pessoa" do Monday. */
export function Pessoas({ nomes, max = 3, className }: { nomes: readonly string[]; max?: number; className?: string }) {
  if (nomes.length === 0) return <span className="text-xs text-muted-foreground">Sem responsável</span>;
  const vis = nomes.slice(0, max);
  const resto = nomes.length - vis.length;
  return (
    <span className={cn("inline-flex items-center", className)} title={nomes.join(", ")}>
      {vis.map((n, i) => (
        <Avatar key={n} className={cn("h-6 w-6 border-2 border-background", i > 0 && "-ml-1.5")}>
          <AvatarFallback className="bg-primary/15 text-[10px] font-semibold text-foreground">{iniciais(n)}</AvatarFallback>
        </Avatar>
      ))}
      {resto > 0 && (
        <span className="-ml-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold">
          +{resto}
        </span>
      )}
    </span>
  );
}
