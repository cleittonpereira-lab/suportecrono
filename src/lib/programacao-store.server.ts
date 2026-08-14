import fs from "fs";
import path from "path";

export interface ProgramacaoData {
  Amostras: Record<string, string>[];
  Ensaios: Record<string, string>[];
  Programações: Record<string, string>[];
  "Tipos de Ensaio": Record<string, string>[];
  Equipamentos: Record<string, string>[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "programacao_db.json");

const TIPOS: Record<string, string>[] = [
  { id: "te-adensamento", nome: "Ensaio de Adensamento (Edômetro)", cor_gantt: "#3b82f6", equipamentos_ids: "eq-ad-01,eq-ad-02" },
  { id: "te-cisalhamento", nome: "Cisalhamento Direto", cor_gantt: "#10b981", equipamentos_ids: "eq-cd-01" },
  { id: "te-triaxial", nome: "Triaxial UU / CU / CD", cor_gantt: "#f59e0b", equipamentos_ids: "eq-tr-01,eq-tr-02" },
  { id: "te-caracterizacao", nome: "Caracterização Comp/CBR", cor_gantt: "#ec4899", equipamentos_ids: "eq-cbr-01" },
  { id: "te-mrdp", nome: "Módulo de Resiliência (MR / DP)", cor_gantt: "#8b5cf6", equipamentos_ids: "eq-mr-01" },
  { id: "te-mctc", nome: "MCT-C (Mini-MCV)", cor_gantt: "#06b6d4", equipamentos_ids: "eq-mct-01" },
  { id: "te-permv", nome: "Permeabilidade (PERM.V)", cor_gantt: "#6366f1", equipamentos_ids: "eq-pm-01" },
  { id: "te-compressao", nome: "Compressão Simples / Diâmetro", cor_gantt: "#14b8a6", equipamentos_ids: "eq-cbr-01" },
];

const EQUIPAMENTOS: Record<string, string>[] = [
  { id: "eq-ad-01", nome: "Adensômetro Pneumático AD-01", codigo: "AD-01" },
  { id: "eq-ad-02", nome: "Adensômetro Pneumático AD-02", codigo: "AD-02" },
  { id: "eq-cd-01", nome: "Célula Cisalhamento CD-01", codigo: "CD-01" },
  { id: "eq-tr-01", nome: "Prensa Triaxial TR-01", codigo: "TR-01" },
  { id: "eq-tr-02", nome: "Prensa Triaxial TR-02", codigo: "TR-02" },
  { id: "eq-mr-01", nome: "Equipamento Triaxial Dinâmico (MR/DP) 01", codigo: "MR-01" },
  { id: "eq-cbr-01", nome: "Prensa CBR / Caracterização 01", codigo: "CBR-01" },
  { id: "eq-mct-01", nome: "Aparelho Mini-MCV (MCT-C) 01", codigo: "MCT-01" },
  { id: "eq-pm-01", nome: "Permeâmetro PM-01", codigo: "PM-01" },
];

// Lista de OS reais extraída do Cronograma Laboratório oficial
const OS_REAIS = [
  { os: "17797-26", tomador: "EPR Litoral Pioneiro", setor: "Convencionais", escopo: "", lab: "" },
  { os: "17723-26", tomador: "Motiva Sorocabana", setor: "Dosagem", escopo: "MR / DP / Dosagem", lab: "7 Dias (1 ST rodou com uns dias de atraso, estou esperando a cura)" },
  { os: "17586-26", tomador: "Motiva RioSP", setor: "Especiais / Convencionais", escopo: "Triaxiais Mec. Solos / Adensamento / Caracterização Comp/CBR || Parcial 1", lab: "Entrega dos ensaios do SH-504-01 e triaxiais UU e CU dos demais SH" },
  { os: "17310-26", tomador: "Motiva Sorocabana", setor: "Convencionais / Especiais", escopo: "MCT.C", lab: "MCT-C - Entregues 47% do laboratório " },
  { os: "17878-26", tomador: "Val Rocha", setor: "Dosagem", escopo: "MR / DP", lab: "MR.C apenas, as compressões subiremos em anexo" },
  { os: "17879-26", tomador: "Motiva Pantanal", setor: "Dosagem", escopo: "MR / DP", lab: "7 Dias - ST de Fresado da OS 17184-26" },
  { os: "17887-26", tomador: "Alves Ribeiro", setor: "Especiais", escopo: "MR / DP", lab: "9 MR.S - Dados fornecidos pelo interessado" },
  { os: "17315-26", tomador: "Via Araucária S.A", setor: "Dosagem", escopo: "MR / DP || Parcial 1", lab: "Entrega Final de MR" },
  { os: "17492-26", tomador: "Motiva RioSP", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "" },
  { os: "17700-26", tomador: "Tetra Tech Engenharia", setor: "Convencionais / Especiais", escopo: "Caracterização Comp/CBR / Triaxiais Mec. Solos / Adensamento", lab: "" },
  { os: "17892-26", tomador: "Souli", setor: "Especiais", escopo: "Triaxiais Mec. Solos", lab: "Triaxial UU - SHs" },
  { os: "17765-26", tomador: "Motiva Pantanal", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "Ano 03 - Amostra em campo" },
  { os: "17714-26", tomador: "Motiva RioSP", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "Entrega prioritária" },
  { os: "17680-26", tomador: "EPR Litoral Pioneiro", setor: "Dosagem", escopo: "MR / DP / Compressão S/D || Parcial 6", lab: "Final - 28 dias - Pedreira Tucumann" },
  { os: "17371-26", tomador: "Motiva Sorocabana", setor: "Convencionais / Especiais", escopo: "MCT.C", lab: "MCT-C" },
  { os: "17073-25", tomador: "Motiva Pantanal", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "Ano 05 - 01 amostra de PI - Em campo" },
  { os: "17851-26", tomador: "Motiva RioSP", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "" },
  { os: "17398-26", tomador: "Motiva Sorocabana", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "" },
  { os: "17619-26", tomador: "Via Araucária S.A", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "Data para as 20 amostras coletadas" },
  { os: "17286-26", tomador: "Motiva Pantanal", setor: "Dosagem", escopo: "MR / DP", lab: "Entrega dos resultados de 28 dias" },
  { os: "17588-26", tomador: "EPR Litoral Pioneiro", setor: "Especiais", escopo: "Adensamento / Cisalhamento", lab: "Manutenção de Pontes" },
  { os: "17590-26", tomador: "ViaAppia Concessionária", setor: "Convencionais", escopo: "Caracterização Comp/CBR", lab: "Trecho Sul KM 45" },
  { os: "17592-26", tomador: "Motiva RioSP", setor: "Dosagem / Especiais", escopo: "MR / DP / Triaxiais Mec. Solos", lab: "Contenção de Encosta" },
];

function getInitialData(): ProgramacaoData {
  const amostras: Record<string, string>[] = [];
  const ensaios: Record<string, string>[] = [];
  const progs: Record<string, string>[] = [];

  let amId = 1;
  let esId = 1;
  let prId = 1;
  const now = new Date();

  OS_REAIS.forEach((data) => {
    const escopoUpper = (data.escopo || "").toUpperCase();
    const labUpper = (data.lab || "").toUpperCase();
    const setorUpper = (data.setor || "").toUpperCase();

    const tiposContratados: string[] = [];

    if (escopoUpper.includes("TRIAXIA") || labUpper.includes("TRIAXIA") || labUpper.includes(" SH")) {
      tiposContratados.push("te-triaxial");
    }
    if (escopoUpper.includes("ADENSAMENTO") || labUpper.includes("ADENSAMENTO")) {
      tiposContratados.push("te-adensamento");
    }
    if (escopoUpper.includes("CISALHAMENTO") || labUpper.includes("CISALHAMENTO")) {
      tiposContratados.push("te-cisalhamento");
    }
    if (escopoUpper.includes("CARACTERIZAÇÃO") || escopoUpper.includes("CBR") || labUpper.includes("CARACT")) {
      tiposContratados.push("te-caracterizacao");
    }
    if (escopoUpper.includes("MR") || escopoUpper.includes("DP") || labUpper.includes("MR.")) {
      tiposContratados.push("te-mrdp");
    }
    if (escopoUpper.includes("MCT") || labUpper.includes("MCT")) {
      tiposContratados.push("te-mctc");
    }
    if (escopoUpper.includes("PERM")) {
      tiposContratados.push("te-permv");
    }
    if (escopoUpper.includes("COMPRESSÃO")) {
      tiposContratados.push("te-compressao");
    }

    if (tiposContratados.length === 0 && data.os !== "17797-26") {
      if (setorUpper.includes("ESPECIAIS")) {
        tiposContratados.push("te-triaxial", "te-adensamento");
      } else if (setorUpper.includes("DOSAGEM")) {
        tiposContratados.push("te-mrdp");
      } else if (setorUpper.includes("CONVENCIONAIS")) {
        tiposContratados.push("te-caracterizacao");
      }
    }

    // Se houver ensaios contratados para esta OS, gera a amostra e ensaios
    if (tiposContratados.length > 0) {
      const amostraId = `am-${amId++}`;
      const amostraCode = labUpper.includes("SH") ? `SH-50${amId % 10}-01` : `ST-0${(amId % 9) + 1}`;
      amostras.push({
        id: amostraId,
        os_numero: data.os,
        codigo_amostra: amostraCode,
        tipo: amostraCode.startsWith("SH") ? "SH" : "ST",
        tomador: data.tomador,
        obra: `OS ${data.os} (${data.setor})`,
        identificacao: `Amostra ${amostraCode} - ${data.tomador}`,
        topo_m: "0.00",
        base_m: "1.50",
      });

      tiposContratados.forEach((tipoId, idx) => {
        const ensaioId = `es-${esId++}`;
        let status = "planejado";
        if (labUpper.includes("ENTREGUE") || labUpper.includes("FINAL")) {
          status = "concluido";
        } else if (labUpper.includes("RODOU") || labUpper.includes("CURA") || idx === 0) {
          status = "em_execucao";
        }

        ensaios.push({
          id: ensaioId,
          amostra_id: amostraId,
          tipo_ensaio_id: tipoId,
          status,
          prazo: "2026-08-30",
          observacoes: data.lab || `Ensaio para OS ${data.os}`,
          detalhes_tecnicos: `Setor: ${data.setor}`,
        });

        if (status === "em_execucao" || status === "programado" || status === "concluido") {
          const tipoObj = TIPOS.find((t) => t.id === tipoId);
          const equipId = tipoObj ? tipoObj.equipamentos_ids.split(",")[0] : "eq-ad-01";

          const offsetDays = (prId % 10) - 3;
          const start = new Date(now.getTime() + offsetDays * 86400000);
          const end = new Date(start.getTime() + 5 * 86400000);

          progs.push({
            id: `pr-${prId++}`,
            ensaio_id: ensaioId,
            equipamento_id: equipId,
            data_inicio: start.toISOString().split("T")[0],
            data_fim: end.toISOString().split("T")[0],
            data_inicio_prevista: start.toISOString().split("T")[0],
            duracao_dias: "5",
            data_inicio_real: status !== "planejado" ? start.toISOString().split("T")[0] : "",
            data_fim_real: status === "concluido" ? end.toISOString().split("T")[0] : "",
            status,
            progresso: status === "concluido" ? "100" : status === "em_execucao" ? "50" : "0",
            observacoes: data.lab || `Programação OS ${data.os}`,
            tecnico: prId % 2 === 0 ? "Cleitton Pereira" : "João Silva",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          });
        }
      });
    }
  });

  return {
    Amostras: amostras,
    Ensaios: ensaios,
    Programações: progs,
    "Tipos de Ensaio": TIPOS,
    Equipamentos: EQUIPAMENTOS,
  };
}

export function readStore(): ProgramacaoData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(FILE_PATH)) {
      const content = fs.readFileSync(FILE_PATH, "utf-8");
      return JSON.parse(content) as ProgramacaoData;
    }
  } catch (err) {
    console.error("Error reading programacao_db.json:", err);
  }
  const initial = getInitialData();
  writeStore(initial);
  return initial;
}

export function writeStore(data: ProgramacaoData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing programacao_db.json:", err);
  }
}
