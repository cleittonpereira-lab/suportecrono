/**
 * Importação de ensaios (planilha da OS → programação), decidida de uma vez
 * sobre os dados atuais. Só lógica — o servidor chama dentro de uma gravação
 * com trava (importarEnsaios em programacao.functions.ts).
 *
 * Antes a tela gravava linha a linha (amostra, tipo, ensaio...), com a lista
 * de tipos que ELA tinha carregado: uma etiqueta sem tipo virava um tipo novo
 * a cada linha, e uma falha no meio deixava a importação pela metade.
 */
import { resolverTipo } from "./programacao-tipos";

type Linha = Record<string, string>;
type Abas = Record<string, Linha[]>;

export type LinhaImportada = {
  identificacao: string;
  codigo_amostra: string;
  tipo: string;
  topo: string;
  base: string;
  amostra_coletada: string;
  /** Uma etiqueta de ensaio (ex.: "CD3.NAT"). */
  tag: string;
  os?: string;
};

export type PedidoImportacao = { osNumero: string; tomador: string; obra: string; linhas: LinhaImportada[] };

export type ResumoImportacao = {
  ensaios: number;
  amostrasNovas: number;
  amostrasExistentes: number;
  /** Mesma amostra, mesmo tipo, mesma etiqueta — já estava na programação. */
  repetidos: number;
  tiposNovos: string[];
};

const norm = (s: unknown) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export function planejarImportacao(
  dados: Abas,
  pedido: PedidoImportacao,
  novoId: () => string,
  agora: string,
): { dados: Abas; resumo: ResumoImportacao } {
  const amostras = [...(dados.Amostras ?? [])];
  const ensaios = [...(dados.Ensaios ?? [])];
  const tipos = [...(dados["Tipos de Ensaio"] ?? [])] as (Linha & { id: string; nome: string })[];
  const resumo: ResumoImportacao = { ensaios: 0, amostrasNovas: 0, amostrasExistentes: 0, repetidos: 0, tiposNovos: [] };

  const chave = (os: string, codigo: string) => `${norm(os)}||${norm(codigo)}`;
  const porChave = new Map<string, Linha>();
  for (const a of amostras) porChave.set(chave(a.os_numero, a.codigo_amostra), a);
  const jaContadas = new Set<string>();

  pedido.linhas.forEach((l, i) => {
    const os = pedido.osNumero || l.os || "Geral";
    const codigo = l.codigo_amostra || l.identificacao || `Amostra ${i + 1}`;
    const k = chave(os, codigo);
    let amostra = porChave.get(k);
    if (!amostra) {
      amostra = {
        os_numero: os,
        codigo_amostra: codigo,
        identificacao: l.identificacao || codigo,
        descricao: [l.identificacao, l.amostra_coletada ? `Coleta: ${l.amostra_coletada}` : ""].filter(Boolean).join(" — ") || codigo,
        tomador: pedido.tomador || "",
        obra: pedido.obra || "",
        prioridade: "media",
        tipo: l.tipo || "ST",
        topo_m: l.topo || "",
        base_m: l.base || "",
        amostra_coletada: l.amostra_coletada || "",
        id: novoId(),
        created_at: agora,
        updated_at: agora,
      };
      amostras.push(amostra);
      porChave.set(k, amostra);
      jaContadas.add(k);
      resumo.amostrasNovas++;
    } else if (!jaContadas.has(k)) {
      jaContadas.add(k);
      resumo.amostrasExistentes++;
    }

    const etiqueta = l.tag.trim();
    let tipo = resolverTipo(etiqueta, tipos);
    if (!tipo) {
      tipo = {
        nome: etiqueta,
        codigo: etiqueta,
        permite_paralelo: "FALSE",
        cor_gantt: "#F0B43C",
        id: novoId(),
        created_at: agora,
        updated_at: agora,
      };
      tipos.push(tipo);
      resumo.tiposNovos.push(etiqueta);
    }

    const repetido = ensaios.some(
      (e) => e.amostra_id === amostra!.id && e.tipo_ensaio_id === tipo!.id && norm(e.etiqueta) === norm(etiqueta),
    );
    if (repetido) {
      resumo.repetidos++;
      return;
    }
    ensaios.push({
      amostra_id: amostra.id,
      tipo_ensaio_id: tipo.id,
      etiqueta,
      status: "pendente",
      prioridade: "media",
      id: novoId(),
      created_at: agora,
      updated_at: agora,
    });
    resumo.ensaios++;
  });

  return { dados: { ...dados, Amostras: amostras, Ensaios: ensaios, "Tipos de Ensaio": tipos }, resumo };
}
