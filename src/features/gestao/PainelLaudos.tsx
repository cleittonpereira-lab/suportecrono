/**
 * Painel do Coordenador — aba Laudos: digitação, verificação, aprovação e
 * entrega em números e gráficos, por dia, por pessoa e por tipo de ensaio.
 * Regra em lib/painel-laudos.ts; leitura em painel-laudos.functions.ts.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { lerPainelDeLaudos } from "@/lib/painel-laudos.functions";
import {
  porFamilia,
  porPessoa,
  seriePorDia,
  temposDasEtapas,
  total,
  type EventoDeLaudo,
  type TipoDeEvento,
} from "@/lib/painel-laudos";
import { rotuloDaFamilia, type Familia } from "@/lib/familia-ensaio";

type Janela = 7 | 30 | 90;

function Cartao({
  titulo,
  subtitulo,
  leitura,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  leitura?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </div>
      {children}
      {leitura && (
        <p className="mt-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {leitura}
        </p>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valor}</div>
      {detalhe && <div className="text-[11px] text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

const SemDados = () => (
  <div className="py-10 text-center text-xs text-muted-foreground">Sem registros no período.</div>
);

const br = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const dias1 = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d úteis`;

/** Uma série por dia (um só eixo, uma só cor). */
function PorDia({
  eventos,
  tipo,
  janela,
  agora,
  cor,
  nome,
}: {
  eventos: EventoDeLaudo[];
  tipo: TipoDeEvento;
  janela: Janela;
  agora: number;
  cor: string;
  nome: string;
}) {
  const serie = useMemo(
    () => seriePorDia(eventos, tipo, agora, janela),
    [eventos, tipo, agora, janela],
  );
  const soma = serie.reduce((s, d) => s + d.n, 0);
  const media = soma / serie.length;
  const pico = serie.reduce((m, d) => (d.n > m.n ? d : m), serie[0]);
  const config = { n: { label: nome, color: cor } } satisfies ChartConfig;
  if (soma === 0) return <SemDados />;
  return (
    <>
      <ChartContainer config={config} className="h-[150px] w-full">
        <BarChart
          data={serie.map((d) => ({ ...d, rotulo: br(d.dia) }))}
          margin={{ left: -28, right: 4, top: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={false}
            fontSize={9}
            interval={janela === 7 ? 0 : janela === 30 ? 4 : 13}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={9} width={24} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fillOpacity: 0.15 }}
            content={<ChartTooltipContent labelKey="rotulo" />}
          />
          <ReferenceLine
            y={media}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 3"
            strokeOpacity={0.6}
          />
          <Bar dataKey="n" fill="var(--color-n)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Total {soma} · média {media.toLocaleString("pt-BR", { maximumFractionDigits: media < 1 ? 2 : 1 })}/dia ·
        pico {pico.n} em {br(pico.dia)}
      </p>
    </>
  );
}

/** Ranking horizontal (pessoas ou tipos). */
function Ranking({
  itens,
  cor,
  nome,
}: {
  itens: { rotulo: string; n: number }[];
  cor: string;
  nome: string;
}) {
  if (itens.length === 0) return <SemDados />;
  const top = itens.slice(0, 8);
  const config = { n: { label: nome, color: cor } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="w-full"
      style={{ height: Math.max(90, top.length * 30) }}
    >
      <BarChart data={top} layout="vertical" margin={{ left: 4, right: 28, top: 0, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="rotulo"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={130}
        />
        <ChartTooltip cursor={{ fillOpacity: 0.15 }} content={<ChartTooltipContent />} />
        <Bar
          dataKey="n"
          fill="var(--color-n)"
          radius={[0, 4, 4, 0]}
          barSize={16}
          isAnimationActive={false}
        >
          <LabelList dataKey="n" position="right" fontSize={11} className="fill-foreground" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function PainelLaudos() {
  const fn = useServerFn(lerPainelDeLaudos);
  const { data, isLoading, error } = useQuery({
    queryKey: ["painel-laudos"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  const [janela, setJanela] = useState<Janela>(30);
  const agora = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading)
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Carregando os laudos…</div>
    );
  if (error || !data)
    return (
      <div className="py-16 text-center text-sm text-destructive">
        Não foi possível carregar: {String((error as Error)?.message ?? "")}
      </div>
    );

  const ev = data.eventos;
  const enviados = total(ev, "enviado", agora, janela);
  const devolvidos = total(ev, "devolvido", agora, janela);
  const aprovados = total(ev, "aprovado", agora, janela);
  const entregues = total(ev, "entregue", agora, janela);
  const tempos = temposDasEtapas(data.ciclos, agora, Math.max(janela, 30));
  const taxaDev = enviados > 0 ? Math.round((devolvidos / enviados) * 100) : null;
  const pessoas = (t: TipoDeEvento) =>
    porPessoa(ev, t, agora, janela).map((p) => ({ rotulo: p.nome, n: p.n }));
  const tipos = porFamilia(ev, "aprovado", agora, janela).map((f) => ({
    rotulo: rotuloDaFamilia(f.familia as Familia),
    n: f.n,
  }));
  const digitadores = pessoas("enviado");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Período:</span>
        <div className="flex rounded-md border p-0.5">
          {([7, 30, 90] as Janela[]).map((j) => (
            <Button
              key={j}
              size="sm"
              variant={janela === j ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setJanela(j)}
            >
              {j} dias
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Numero
          rotulo="Enviados p/ verificação"
          valor={String(enviados)}
          detalhe="digitações concluídas"
        />
        <Numero
          rotulo="Devolvidos"
          valor={String(devolvidos)}
          detalhe={taxaDev == null ? "—" : `${taxaDev}% dos enviados`}
        />
        <Numero rotulo="Aprovados" valor={String(aprovados)} detalhe="laudos emitidos" />
        <Numero rotulo="Entregues" valor={String(entregues)} detalhe="SOND + GDrive" />
        <Numero
          rotulo="A entregar agora"
          valor={String(data.aEntregar)}
          detalhe="aprovados sem entrega"
        />
      </div>

      <Cartao
        titulo="Tempo de cada etapa (mediana)"
        subtitulo={`Laudos aprovados nos últimos ${Math.max(janela, 30)} dias (${tempos.amostra}) · dias úteis`}
        leitura={
          tempos.amostra === 0
            ? undefined
            : `Da digitação enviada à aprovação leva ${dias1(tempos.total)}. ` +
              (tempos.entrega == null
                ? "Ainda sem entregas registradas para medir a última etapa."
                : `Depois de aprovado, mais ${dias1(tempos.entrega)} até a entrega.`)
        }
      >
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Numero rotulo="Espera da verificação" valor={dias1(tempos.verificacao)} />
          <Numero rotulo="Espera da aprovação" valor={dias1(tempos.aprovacao)} />
          <Numero rotulo="Aprovado → entregue" valor={dias1(tempos.entrega)} />
          <Numero rotulo="Enviado → aprovado" valor={dias1(tempos.total)} />
        </div>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Digitações por dia" subtitulo="Laudos enviados para verificação">
          <PorDia
            eventos={ev}
            tipo="enviado"
            janela={janela}
            agora={agora}
            cor="var(--chart-1)"
            nome="Enviados"
          />
        </Cartao>
        <Cartao titulo="Laudos aprovados por dia" subtitulo="Emitidos pelo RT">
          <PorDia
            eventos={ev}
            tipo="aprovado"
            janela={janela}
            agora={agora}
            cor="var(--chart-2)"
            nome="Aprovados"
          />
        </Cartao>
        <Cartao titulo="Entregas por dia" subtitulo="SOND e GDrive completos">
          <PorDia
            eventos={ev}
            tipo="entregue"
            janela={janela}
            agora={agora}
            cor="var(--chart-3)"
            nome="Entregues"
          />
        </Cartao>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao
          titulo="Quem digita"
          subtitulo="Laudos enviados para verificação"
          leitura={
            digitadores.length
              ? `${digitadores[0].rotulo} lidera com ${digitadores[0].n} no período.`
              : undefined
          }
        >
          <Ranking itens={digitadores} cor="var(--chart-1)" nome="Enviados" />
        </Cartao>
        <Cartao titulo="Quem verifica" subtitulo="Verificações registradas">
          <Ranking itens={pessoas("verificado")} cor="var(--chart-4)" nome="Verificados" />
        </Cartao>
        <Cartao titulo="Quem aprova" subtitulo="Aprovações registradas">
          <Ranking itens={pessoas("aprovado")} cor="var(--chart-2)" nome="Aprovados" />
        </Cartao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Laudos aprovados por tipo de ensaio">
          <Ranking itens={tipos} cor="var(--chart-2)" nome="Aprovados" />
        </Cartao>
        <Cartao
          titulo="Devoluções por digitador"
          subtitulo="Laudos devolvidos pelo verificador (quem enviou a revisão)"
          leitura="Devolução alta indica ponto de treinamento ou dado de bancada incompleto."
        >
          <Ranking
            itens={porPessoa(ev, "devolvido", agora, janela, "dono").map((p) => ({
              rotulo: p.nome,
              n: p.n,
            }))}
            cor="var(--chart-5)"
            nome="Devolvidos"
          />
        </Cartao>
      </div>
    </div>
  );
}
