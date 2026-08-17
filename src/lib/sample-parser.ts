/**
 * Parser unificado para amostras vindas do Gantt / Banco de Dados.
 * Garante separação estrita e precisa entre:
 * - Furo de Sondagem (ex: "STMS-P5-01", "BL-523-02", "SP-01")
 * - Profundidade (ex: "2.00 – 5.00 m")
 * - Tipo / Coleta (ex: "Coleta: DEF.60", "Bloco indeformado")
 * - Caracterização Tátil-Visual Geotécnica (ex: "Argila siltosa variegada")
 */

export interface ParsedSampleData {
  furo: string;
  prof: string;
  tipo: string;
  desc: string;
  codigo: string;
}

export function parseGanttSampleData(rawSample: any): ParsedSampleData {
  if (!rawSample) {
    return { furo: "", prof: "", tipo: "", desc: "", codigo: "" };
  }

  let furo = (rawSample.furo || rawSample.borehole || "").trim();
  let desc = (rawSample.descricao || rawSample.description || "").trim();
  let tipo = (rawSample.tipo || rawSample.sampleType || "").trim();
  let codigo = (rawSample.codigo_amostra || rawSample.code || rawSample.id || rawSample.reportNumber || "").trim();
  const ident = (rawSample.identificacao || "").trim();

  // 1. Se identificacao não for apenas o mesmo código numérico da amostra, é o Furo de Sondagem
  if (!furo && ident) {
    if (ident !== codigo && !/^\d{4,6}(-\d+)?$/.test(ident)) {
      furo = ident;
    } else if (!furo) {
      furo = ident;
    }
  }

  // 2. Se a descrição vier no padrão "FURO — Coleta: TIPO" ou "FURO - Coleta: TIPO"
  if (desc) {
    const coletaMatch = desc.split(/\s*[-—–]\s*Coleta:\s*/i);
    if (coletaMatch.length >= 2) {
      if (!furo || furo === codigo) {
        furo = coletaMatch[0].trim();
      }
      if (!tipo) {
        tipo = `Coleta: ${coletaMatch[1].trim()}`;
      }
      desc = ""; // Não deixar texto de furo/coleta na caracterização tátil-visual
    } else if (!furo || furo === codigo) {
      // Se a descrição começa com prefixo conhecido de furo (ex: BL-, STMS-, SP-, SH-, F-, PO-, SM-)
      if (
        /^(BL|STMS|SP|SH|PO|SM|F|SR|TR|PV|TC|SOND)[-_ ]/i.test(desc) ||
        desc.includes("Coleta:")
      ) {
        const parts = desc.split(/\s*[-—–]\s*/);
        if (parts[0]) {
          furo = parts[0].trim();
          desc = parts.slice(1).join(" — ").replace(/Coleta:\s*/i, "").trim();
        }
      }
    }
  }

  // 3. Se furo ficou igual ao código da amostra (ex: 11545-02), mas a descrição tem o furo real
  if (furo === codigo && desc) {
    const matchFuro = desc.match(/^([A-Z0-9_-]+)\s*[-—–]/i);
    if (matchFuro && matchFuro[1]) {
      furo = matchFuro[1].trim();
    }
  }

  // 4. Profundidade
  let prof = "";
  if (rawSample.topo_m != null && rawSample.base_m != null && (rawSample.topo_m !== "" || rawSample.base_m !== "")) {
    prof = `${rawSample.topo_m} – ${rawSample.base_m} m`;
  } else if (rawSample.profundidade) {
    prof = String(rawSample.profundidade).includes("m")
      ? String(rawSample.profundidade)
      : `${rawSample.profundidade} m`;
  } else if (rawSample.depth) {
    prof = String(rawSample.depth).includes("m")
      ? String(rawSample.depth)
      : `${rawSample.depth} m`;
  }

  return { furo, prof, tipo, desc, codigo };
}
