/**
 * Painel do coordenador — aba Análises: os mesmos dados do painel, em
 * gráfico, com tendência, média e uma linha de leitura pronta por gráfico
 * (pedido do usuário: "muitos gráficos... com tendências, médias,
 * avaliações e análises"). Nada aqui busca dado novo — tudo vem do que a
 * aba Operação já calculou (`PainelModelo`/`Bancada`/`Desempenho`).
 */
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, XAxis, YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Desempenho, SerieSemanal } from "@/lib/painel-desempenho";
import type { Bancada as BancadaModelo, EtapaDeLaudo, EtapaEsteira, LinhaPrazo } from "@/lib/painel-coordenador";

function CardAnalise({
  titulo, subtitulo, leitura, children,
}: { titulo: string; subtitulo?: string; leitura?: string; children: React.ReactNode }) {
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

function SemDados() {
  return <div className="py-10 text-center text-xs text-muted-foreground">Sem dados suficientes para este gráfico.</div>;
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const media = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
const arred1 = (n: number) => Math.round(n * 10) / 10;

/* --------------------------- 1) tendência semanal --------------------------- */

const NOME_CURTO: Record<SerieSemanal["chave"], string> = {
  recebidas: "Recebidas", concluidos: "Concluídos", aprovados: "Aprovados", entregues: "Entregues",
};

function GraficoSerie({ s, semanas }: { s: SerieSemanal; semanas: string[] }) {
  const m = s.media;
  const dados = s.valores.map((v, i) => ({ semana: br(semanas[i]), valor: v }));
  const tendencia = s.valores.length >= 2 ? s.valores[s.valores.length - 1] - s.valores[0] : 0;
  const config = { valor: { label: NOME_CURTO[s.chave], color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium">{s.nome}</span>
        <span className="text-[11px] text-muted-foreground">média {arred1(m)}/sem.</span>
      </div>
      <ChartContainer config={config} className="h-[140px] w-full">
        <LineChart data={dados} margin={{ left: -28, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="semana" tickLine={false} axisLine={false} fontSize={9} interval={1} />
          <YAxis tickLine={false} axisLine={false} fontSize={9} width={24} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine y={m} stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeOpacity={0.6} />
          <Line dataKey="valor" stroke="var(--color-valor)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {tendencia > 0 ? "▲" : tendencia < 0 ? "▼" : "→"} {tendencia === 0 ? "estável" : `${tendencia > 0 ? "+" : ""}${tendencia} vs. 8 semanas atrás`}
      </p>
    </div>
  );
}

/* --------------------------- 2) % no prazo por semana --------------------------- */

function GraficoNoPrazoSemanal({ d }: { d: Desempenho }) {
  const dados = d.semanas.map((sem, i) => ({ semana: br(sem), pct: d.pctNoPrazoPorSemana[i] }));
  const validos = d.pctNoPrazoPorSemana.filter((v): v is number => v != null);
  if (validos.length === 0) return <SemDados />;
  const m = Math.round(media(validos));
  const config = { pct: { label: "% no prazo", color: "var(--chart-2)" } } satisfies ChartConfig;
  const ultimaValida = [...d.pctNoPrazoPorSemana].reverse().find((v) => v != null) ?? null;
  return (
    <CardAnalise
      titulo="Entregas no prazo — tendência semanal"
      subtitulo="postagem até a data programada, por semana"
      leitura={
        ultimaValida == null
          ? "Sem entregas com data programada nas últimas semanas."
          : ultimaValida >= m
            ? `Semana atual em ${ultimaValida}% — na média ou acima da média das 8 semanas (${m}%).`
            : `Semana atual em ${ultimaValida}% — abaixo da média das 8 semanas (${m}%). Vale olhar o que atrasou.`
      }
    >
      <ChartContainer config={config} className="h-[220px] w-full">
        <LineChart data={dados} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="semana" tickLine={false} axisLine={false} fontSize={10} />
          <YAxis tickLine={false} axisLine={false} fontSize={10} domain={[0, 100]} unit="%" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine y={m} stroke="var(--muted-foreground)" strokeDasharray="4 3" label={{ value: `média ${m}%`, position: "insideTopLeft", fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Line dataKey="pct" stroke="var(--color-pct)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </CardAnalise>
  );
}

/* --------------------------- 3) distribuição de prazos --------------------------- */

function GraficoDistribuicaoPrazos({ prazos }: { prazos: LinhaPrazo[] }) {
  if (prazos.length === 0) return <CardAnalise titulo="OS em aberto — situação"><SemDados /></CardAnalise>;
  const total = prazos.length;
  const atraso = prazos.filter((p) => p.situacao === "atraso").length;
  const risco = prazos.filter((p) => p.situacao === "risco").length;
  const ok = total - atraso - risco;
  const dados = [
    { situacao: "No prazo", total: ok, cor: "var(--chart-2)" },
    { situacao: "Em risco", total: risco, cor: "var(--chart-1)" },
    { situacao: "Atrasada", total: atraso, cor: "var(--destructive)" },
  ];
  const config = { total: { label: "OS" } } satisfies ChartConfig;
  const pctAtraso = Math.round((atraso / total) * 100);
  return (
    <CardAnalise
      titulo="OS em aberto — situação"
      subtitulo={`${total} OS com entrega em aberto (atrasadas + próximos 15 dias)`}
      leitura={
        atraso === 0
          ? "Nenhuma OS atrasada agora."
          : `${pctAtraso}% das OS em aberto estão atrasadas (${atraso} de ${total}) — priorize essas na bancada/verificação.`
      }
    >
      <ChartContainer config={config} className="h-[180px] w-full">
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
          <YAxis type="category" dataKey="situacao" tickLine={false} axisLine={false} fontSize={11} width={70} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {dados.map((d) => <Cell key={d.situacao} fill={d.cor} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
    </CardAnalise>
  );
}

/* --------------------------- 4) utilização da bancada --------------------------- */

function GraficoUtilizacaoBancada({ bancada }: { bancada: BancadaModelo }) {
  const dados = bancada.equipamentos
    .map((q) => ({
      nome: q.nome.length > 22 ? `${q.nome.slice(0, 21)}…` : q.nome,
      pct: q.dias.length ? Math.round((q.dias.filter((d) => d !== "livre").length / q.dias.length) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
  if (dados.length === 0) return <CardAnalise titulo="Utilização da bancada por equipamento"><SemDados /></CardAnalise>;
  const maisOcupado = dados[0];
  const menosOcupado = dados[dados.length - 1];
  const config = { pct: { label: "% ocupado" } } satisfies ChartConfig;
  return (
    <CardAnalise
      titulo="Utilização da bancada por equipamento"
      subtitulo={`% de dias ocupados na janela de ${bancada.dias.length} dias úteis`}
      leitura={`Mais ocupado: ${maisOcupado.nome} (${maisOcupado.pct}%). Mais livre: ${menosOcupado.nome} (${menosOcupado.pct}%).`}
    >
      <ChartContainer config={config} className="h-[260px] w-full">
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} fontSize={10} domain={[0, 100]} unit="%" />
          <YAxis type="category" dataKey="nome" tickLine={false} axisLine={false} fontSize={10} width={130} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {dados.map((d) => <Cell key={d.nome} fill={d.pct >= 80 ? "var(--destructive)" : d.pct >= 50 ? "var(--chart-1)" : "var(--chart-2)"} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
    </CardAnalise>
  );
}

/* --------------------------- 5) idade média dos laudos --------------------------- */

function GraficoIdadeLaudos({ laudos }: { laudos: EtapaDeLaudo[] }) {
  const dados = laudos.map((et) => ({
    nome: et.nome,
    media: et.itens.length ? arred1(media(et.itens.map((i) => i.idade))) : 0,
    total: et.total,
  }));
  const comDados = dados.filter((d) => d.total > 0);
  if (comDados.length === 0) return <CardAnalise titulo="Laudos — tempo médio por etapa"><SemDados /></CardAnalise>;
  const pior = [...comDados].sort((a, b) => b.media - a.media)[0];
  const config = { media: { label: "Idade média (dias úteis)", color: "var(--chart-3)" } } satisfies ChartConfig;
  return (
    <CardAnalise
      titulo="Laudos — tempo médio por etapa"
      subtitulo="idade média (dias úteis) dos laudos que estão em cada etapa agora"
      leitura={`Maior espera: ${pior.nome} — em média ${pior.media} dia(s) útil(eis) por lá agora.`}
    >
      <ChartContainer config={config} className="h-[200px] w-full">
        <BarChart data={dados} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={10} />
          <YAxis tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="media" fill="var(--color-media)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </CardAnalise>
  );
}

/* --------------------------- 6) esteira: total x parados --------------------------- */

function GraficoEsteira({ esteira }: { esteira: EtapaEsteira[] }) {
  const dados = esteira.map((e) => ({ nome: e.nome, total: e.total, parados: e.parados }));
  const gargalo = esteira.find((e) => e.gargalo);
  const config = {
    total: { label: "Total na etapa", color: "var(--chart-4)" },
    parados: { label: "Parados", color: "var(--destructive)" },
  } satisfies ChartConfig;
  return (
    <CardAnalise
      titulo="Esteira da operação — total x parados"
      subtitulo="o que está em cada etapa agora"
      leitura={gargalo ? `Gargalo atual: ${gargalo.nome} — ${gargalo.parados} de ${gargalo.total} parado(s).` : "Nenhuma etapa com gargalo agora."}
    >
      <ChartContainer config={config} className="h-[220px] w-full">
        <BarChart data={dados} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={9.5} interval={0} angle={-12} textAnchor="end" height={40} />
          <YAxis tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="parados" fill="var(--color-parados)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </CardAnalise>
  );
}

/* --------------------------- 7) SLA por setor --------------------------- */

function GraficoSlaPorSetor({ dados }: { dados: { setor: string; d: Desempenho }[] }) {
  const linhas = dados
    .map((x) => ({ setor: x.setor, pct: x.d.noPrazo.pct, total: x.d.noPrazo.total }))
    .filter((x) => x.total > 0);
  if (linhas.length === 0) return <CardAnalise titulo="Cumprimento de prazo por setor"><SemDados /></CardAnalise>;
  const melhor = [...linhas].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const pior = [...linhas].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];
  const config = { pct: { label: "% no prazo", color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <CardAnalise
      titulo="Cumprimento de prazo por setor"
      subtitulo="% de entregas no prazo, últimas 8 semanas"
      leitura={
        melhor.setor === pior.setor
          ? `${melhor.setor}: ${melhor.pct}% no prazo.`
          : `Melhor: ${melhor.setor} (${melhor.pct}%). Pior: ${pior.setor} (${pior.pct}%).`
      }
    >
      <ChartContainer config={config} className="h-[200px] w-full">
        <BarChart data={linhas} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="setor" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={10} domain={[0, 100]} unit="%" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="pct" fill="var(--color-pct)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </CardAnalise>
  );
}

/* ------------------------------------ topo ------------------------------------ */

export function PainelAnalises({
  esteira, prazos, bancada, laudos, desempenho, desempenhoPorSetor,
}: {
  esteira: EtapaEsteira[];
  prazos: LinhaPrazo[];
  bancada: BancadaModelo;
  laudos: EtapaDeLaudo[];
  desempenho: Desempenho | null;
  desempenhoPorSetor: { setor: string; d: Desempenho }[];
}) {
  return (
    <div className="space-y-4">
      {desempenho && (
        <CardAnalise
          titulo="Tendência semanal — últimas 8 semanas"
          subtitulo="cada linha com a média do período (tracejada)"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {desempenho.series.map((s) => (
              <GraficoSerie key={s.chave} s={s} semanas={desempenho.semanas} />
            ))}
          </div>
        </CardAnalise>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {desempenho && <GraficoNoPrazoSemanal d={desempenho} />}
        <GraficoSlaPorSetor dados={desempenhoPorSetor} />
        <GraficoDistribuicaoPrazos prazos={prazos} />
        <GraficoIdadeLaudos laudos={laudos} />
        <GraficoUtilizacaoBancada bancada={bancada} />
        <GraficoEsteira esteira={esteira} />
      </div>
    </div>
  );
}
