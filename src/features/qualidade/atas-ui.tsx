/**
 * Peças visuais das atas, no jeito do Monday: grupos com faixa colorida à
 * esquerda, situação como uma célula inteira colorida (clica e escolhe a
 * cor), pessoas em bolinhas e a "bateria" que resume o grupo por situação.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  iniciais,
  itemAtrasado,
  STATUS_ITEM_LABEL,
  STATUS_REUNIAO_LABEL,
  type ItemAta,
  type StatusItem,
  type StatusReuniao,
} from "@/lib/atas-qualidade";

/** Paleta de rótulos do Monday (cores sólidas, texto branco). */
export const COR = {
  verde: "#00c875",
  laranja: "#fdab3d",
  vermelho: "#e2445c",
  cinza: "#c4c4c4",
  grafite: "#808080",
  azul: "#579bfc",
  roxo: "#a25ddc",
  turquesa: "#4eccc6",
  coral: "#ff642e",
} as const;

export const COR_DO_STATUS: Record<StatusItem, string> = {
  pendente: COR.cinza,
  em_andamento: COR.laranja,
  concluida: COR.verde,
  cancelada: COR.grafite,
  transferida: COR.azul,
};

export const COR_DA_REUNIAO: Record<StatusReuniao, string> = {
  agendada: COR.azul,
  em_andamento: COR.laranja,
  encerrada: COR.verde,
};

/** Cor e rótulo que o item mostra — atrasada vence a situação gravada. */
export function aparenciaDoItem(item: Pick<ItemAta, "tipo" | "status" | "prazo">, hoje: string): { cor: string; rotulo: string } {
  if (itemAtrasado(item, hoje)) return { cor: COR.vermelho, rotulo: "Atrasada" };
  return { cor: COR_DO_STATUS[item.status], rotulo: STATUS_ITEM_LABEL[item.status] };
}

const ESCOLHAVEIS: StatusItem[] = ["pendente", "em_andamento", "concluida", "cancelada"];

/** Célula de situação: o bloco colorido inteiro é o botão. */
export function CelulaStatus({
  item, hoje, onChange, disabled, className,
}: {
  item: ItemAta; hoje: string; onChange: (s: StatusItem) => void; disabled?: boolean; className?: string;
}) {
  const { cor, rotulo } = aparenciaDoItem(item, hoje);
  const bloco = (
    <span
      className={cn("flex h-full min-h-9 w-full items-center justify-center px-2 text-center text-[13px] font-medium text-white", className)}
      style={{ background: cor }}
    >
      {item.status === "transferida" && item.transferidaPara ? `Passou p/ nº ${item.transferidaPara.reuniaoNumero}` : rotulo}
    </span>
  );
  // Transferida não se escolhe à mão: acontece ao trazer para outra reunião.
  if (item.status === "transferida" || disabled) return bloco;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="block h-full w-full transition-[filter] hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Situação: ${rotulo}`}>
          {bloco}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-44 p-2">
        <div className="grid gap-1.5">
          {ESCOLHAVEIS.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => onChange(s)}
              className="justify-center rounded-sm py-1.5 text-[13px] font-medium text-white focus:text-white data-[highlighted]:brightness-95"
              style={{ background: COR_DO_STATUS[s] }}
            >
              {STATUS_ITEM_LABEL[s]}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CelulaStatusReuniao({ status, className }: { status: StatusReuniao; className?: string }) {
  return (
    <span
      className={cn("flex h-full min-h-9 w-full items-center justify-center px-2 text-[13px] font-medium text-white", className)}
      style={{ background: COR_DA_REUNIAO[status] }}
    >
      {STATUS_REUNIAO_LABEL[status]}
    </span>
  );
}

/** Rótulo colorido avulso (ex.: situação da reunião no cabeçalho). */
export function Etiqueta({ cor, children, className }: { cor: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium text-white", className)} style={{ background: cor }}>
      {children}
    </span>
  );
}

/**
 * "Bateria" do Monday: uma barra dividida na proporção de cada situação.
 * Passe só as ações (decisões e informes não têm situação).
 */
export function Bateria({ itens, hoje, className }: { itens: readonly ItemAta[]; hoje: string; className?: string }) {
  const contas = new Map<string, { cor: string; rotulo: string; n: number }>();
  for (const i of itens) {
    const a = aparenciaDoItem(i, hoje);
    const c = contas.get(a.rotulo) ?? { ...a, n: 0 };
    c.n++;
    contas.set(a.rotulo, c);
  }
  const total = itens.length;
  if (total === 0) return <div className={cn("h-6 w-full rounded-sm bg-muted", className)} />;
  const ordem = ["Concluída", "Em andamento", "Atrasada", "Pendente", "Cancelada", "Passou p/ outra reunião"];
  const partes = [...contas.values()].sort((a, b) => ordem.indexOf(a.rotulo) - ordem.indexOf(b.rotulo));
  return (
    <div className={cn("flex h-6 w-full overflow-hidden rounded-sm", className)}>
      {partes.map((p) => (
        <Tooltip key={p.rotulo}>
          <TooltipTrigger asChild>
            <div className="h-full" style={{ width: `${(p.n / total) * 100}%`, background: p.cor }} />
          </TooltipTrigger>
          <TooltipContent>
            {p.rotulo}: {p.n} de {total} ({Math.round((p.n / total) * 100)}%)
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Bolinhas com as iniciais, como na coluna "Pessoa" do Monday. */
export function Pessoas({ nomes, max = 3, className, vazio = "Sem responsável" }: { nomes: readonly string[]; max?: number; className?: string; vazio?: string }) {
  if (nomes.length === 0) return <span className="text-xs text-muted-foreground">{vazio}</span>;
  const vis = nomes.slice(0, max);
  const resto = nomes.length - vis.length;
  return (
    <span className={cn("inline-flex items-center", className)} title={nomes.join(", ")}>
      {vis.map((n, i) => (
        <Avatar key={n} className={cn("h-7 w-7 border-2 border-background", i > 0 && "-ml-2")}>
          <AvatarFallback className="text-[10px] font-semibold text-white" style={{ background: corDaPessoa(n) }}>{iniciais(n)}</AvatarFallback>
        </Avatar>
      ))}
      {resto > 0 && (
        <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold">
          +{resto}
        </span>
      )}
    </span>
  );
}

const CORES_PESSOA = ["#579bfc", "#a25ddc", "#00c875", "#ff642e", "#e2445c", "#4eccc6", "#fdab3d", "#9d50dd", "#225091", "#037f4c"];
/** Cada pessoa sempre com a mesma cor (pelo nome). */
export function corDaPessoa(nome: string): string {
  let h = 0;
  for (const ch of nome.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES_PESSOA[h % CORES_PESSOA.length];
}

/**
 * Grupo do Monday: título colorido com seta para recolher e a tabela com a
 * faixa da mesma cor à esquerda.
 */
export function Grupo({
  cor, titulo, detalhe, acoes, children, inicialAberto = true,
}: {
  cor: string; titulo: ReactNode; detalhe?: ReactNode; acoes?: ReactNode; children: ReactNode; inicialAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(inicialAberto);
  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => setAberto((v) => !v)} className="flex items-center gap-1.5 text-left" style={{ color: cor }}>
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-[17px] font-semibold leading-tight">{titulo}</span>
        </button>
        {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
        {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
      </div>
      {aberto && (
        <div className="overflow-x-auto rounded-md border bg-card" style={{ borderLeft: `6px solid ${cor}` }}>
          {children}
        </div>
      )}
    </section>
  );
}

/** Célula de cabeçalho das tabelas no estilo do Monday. */
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("h-9 border-b border-r px-2 text-center text-xs font-normal text-muted-foreground last:border-r-0", className)}>{children}</th>;
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("h-9 border-b border-r p-0 align-middle last:border-r-0", className)}>{children}</td>;
}
