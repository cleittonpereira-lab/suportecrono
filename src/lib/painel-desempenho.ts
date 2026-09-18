/**
 * Desempenho do laboratório nas últimas semanas (Painel do coordenador, Fase
 * 3) — só lógica. Semana = segunda a domingo; a última é a atual (parcial).
 *
 *  - amostras recebidas: pela data de chegada (quadro de chegada);
 *  - ensaios concluídos: pelo fim real na bancada (Programação);
 *  - laudos aprovados: pela última alteração da pendência aprovada;
 *  - OS entregues: pela data de postagem (aba OS ENTREGUES + linhas do
 *    Cronograma já postadas, sem contar duas vezes);
 *  - no prazo: postagem até a data programada;
 *  - da chegada à entrega: da primeira chegada da OS à postagem (só OS cuja
 *    chegada tem o número — campo "Nº da OS" ou o número no texto).
 */
import { chaveOs, diasEntre, osDaChegada, paraIso, somaDias, type Destino, type EntradaPainel } from "./painel-coordenador";
import { splitSetores } from "./schedule-utils";

export const SEMANAS_DESEMPENHO = 8;

export type Entrega = { os: string; setor: string; dataPostagem: string; dataProgramada: string };

export type SerieSemanal = {
  chave: "recebidas" | "concluidos" | "aprovados" | "entregues";
  nome: string;
  /** Uma contagem por semana, da mais antiga à atual. */
  valores: number[];
  atual: number;
  media: number;
  destino: Destino;
};

export type Desempenho = {
  /** Segunda-feira de cada semana ("AAAA-MM-DD"). */
  semanas: string[];
  series: SerieSemanal[];
  noPrazo: { pct: number | null; noPrazo: number; total: number; pctAnterior: number | null };
  /** % no prazo em cada uma das 8 semanas (mesmo índice de `semanas`) — null quando a semana não teve entrega com data programada. */
  pctNoPrazoPorSemana: (number | null)[];
  tempoAteEntrega: { mediana: number | null; n: number };
};

const diaDaSemana = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
export const segundaDaSemana = (iso: string) => somaDias(iso, -((diaDaSemana(iso) + 6) % 7));

export function montarDesempenho(e: EntradaPainel, entregas: Entrega[]): Desempenho {
  const atual = segundaDaSemana(e.hoje);
  const semanas = Array.from({ length: SEMANAS_DESEMPENHO }, (_, i) => somaDias(atual, -7 * (SEMANAS_DESEMPENHO - 1 - i)));
  const inicio = semanas[0];
  const semanaDe = (iso: string | null) => (!iso || iso < inicio || iso > e.hoje ? -1 : Math.floor(diasEntre(inicio, iso) / 7));
  const zeros = () => semanas.map(() => 0);

  // Setor de cada OS pelo Cronograma — o mesmo filtro do painel.
  const setoresDaOs = new Map<string, Set<string>>();
  for (const r of e.cronograma) {
    const k = chaveOs(r.os);
    if (!k) continue;
    const s = setoresDaOs.get(k) ?? new Set<string>();
    for (const x of splitSetores(r.setor)) s.add(x);
    setoresDaOs.set(k, s);
  }
  const noEscopo = (k: string | null | undefined) => e.setor === "todos" || (!!k && !!setoresDaOs.get(k)?.has(e.setor));
  const osDaAmostra = new Map(e.amostras.map((a) => [a.id, chaveOs(a.os_numero)]));
  const ensaioPorId = new Map(e.ensaios.map((x) => [x.id, x]));
  const osDaChegadaDe = (c: EntradaPainel["chegadas"][number]) => (c.osNumero?.trim() ? chaveOs(c.osNumero) : osDaChegada(c.osCliente));

  const recebidas = zeros();
  for (const c of e.chegadas) {
    if (!noEscopo(osDaChegadaDe(c))) continue;
    const i = semanaDe(paraIso(c.dataChegada));
    if (i >= 0) recebidas[i] += c.amostras || 1;
  }

  const concluidos = zeros();
  for (const p of e.programacoes) {
    if (!p.data_fim_real) continue;
    const en = ensaioPorId.get(p.ensaio_id);
    if (en ? !noEscopo(osDaAmostra.get(en.amostra_id)) : e.setor !== "todos") continue;
    const i = semanaDe(paraIso(p.data_fim_real));
    if (i >= 0) concluidos[i]++;
  }

  const aprovados = zeros();
  for (const l of e.pendencias) {
    if (l.status !== "aprovado" || !noEscopo(chaveOs(l.os))) continue;
    const i = semanaDe(paraIso(l.updated_at || l.created_at));
    if (i >= 0) aprovados[i]++;
  }

  // Entregas: aba OS ENTREGUES + Cronograma já postado, uma vez cada (OS + data de postagem).
  const vistas = new Set<string>();
  const lista: { chave: string; postagem: string; programada: string | null }[] = [];
  const incluir = (os: string, setor: string, postagem: string, programada: string) => {
    const k = chaveOs(os);
    const post = paraIso(postagem);
    if (!k || !post) return;
    if (e.setor !== "todos" && !splitSetores(setor).includes(e.setor)) return;
    const id = `${k}|${post}`;
    if (vistas.has(id)) return;
    vistas.add(id);
    lista.push({ chave: k, postagem: post, programada: paraIso(programada) });
  };
  for (const r of entregas) incluir(r.os, r.setor, r.dataPostagem, r.dataProgramada);
  for (const r of e.cronograma) if ((r.dataPostagem ?? "").trim()) incluir(r.os, r.setor, r.dataPostagem, r.dataEntrega);
  const entregues = zeros();
  for (const x of lista) {
    const i = semanaDe(x.postagem);
    if (i >= 0) entregues[i]++;
  }

  const noPrazoEntre = (de: string, ate: string) => {
    const js = lista.filter((x) => x.postagem >= de && x.postagem <= ate && x.programada);
    const ok = js.filter((x) => x.postagem <= (x.programada as string)).length;
    return { pct: js.length ? Math.round((ok / js.length) * 100) : null, noPrazo: ok, total: js.length };
  };
  const agora = noPrazoEntre(inicio, e.hoje);
  const antes = noPrazoEntre(somaDias(inicio, -7 * SEMANAS_DESEMPENHO), somaDias(inicio, -1));
  const pctNoPrazoPorSemana = semanas.map((seg) => noPrazoEntre(seg, somaDias(seg, 6)).pct);

  const primeiraChegada = new Map<string, string>();
  for (const c of e.chegadas) {
    const os = osDaChegadaDe(c);
    const iso = paraIso(c.dataChegada);
    if (!os || !iso) continue;
    const a = primeiraChegada.get(os);
    if (!a || iso < a) primeiraChegada.set(os, iso);
  }
  const tempos = lista
    .filter((x) => x.postagem >= inicio && x.postagem <= e.hoje)
    .map((x) => {
      const ch = primeiraChegada.get(x.chave);
      return ch && ch <= x.postagem ? diasEntre(ch, x.postagem) : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  const meio = Math.floor(tempos.length / 2);
  const mediana = !tempos.length ? null : tempos.length % 2 ? tempos[meio] : Math.round((tempos[meio - 1] + tempos[meio]) / 2);

  const serie = (chave: SerieSemanal["chave"], nome: string, valores: number[], destino: Destino): SerieSemanal => ({
    chave,
    nome,
    valores,
    atual: valores[valores.length - 1],
    media: Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10,
    destino,
  });

  return {
    semanas,
    series: [
      serie("recebidas", "Amostras recebidas", recebidas, { to: "/chegada-amostras" }),
      serie("concluidos", "Ensaios concluídos na bancada", concluidos, { to: "/programacao/gantt" }),
      serie("aprovados", "Laudos aprovados", aprovados, { to: "/relatorio/pendentes", search: { tab: "emissoes-historico" } }),
      serie("entregues", "OS entregues", entregues, { to: "/entregas" }),
    ],
    noPrazo: { ...agora, pctAnterior: antes.pct },
    pctNoPrazoPorSemana,
    tempoAteEntrega: { mediana, n: tempos.length },
  };
}
