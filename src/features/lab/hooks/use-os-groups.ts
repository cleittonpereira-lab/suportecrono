import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { labStore, useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import { listPendenciasDigitacao, type PendenciaDigitacao } from "@/lib/lab-pendencias.functions";
import { listRows } from "@/lib/programacao.functions";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { detectMethodology } from "@/features/mesp-natural/calc";
import { normOs } from "@/lib/schedule-utils";
import { parseGanttSampleData } from "@/lib/sample-parser";

export interface EnsaioItemOS {
  id: string;
  pendenciaId?: string;
  amostraId?: string;
  amostra: string;
  furo?: string;
  prof?: string;
  codigo?: string;
  ensaio: string;
  tipo: EnsaioTipo;
  status: "programado" | "execucao" | "em_digitacao" | "verificacao" | "aprovado" | "concluido_externo";
  tecnico?: string;
  digitador?: string;
  verificador?: string;
  aprovador?: string;
  revisao?: string;
}

export interface OsGroup {
  osNumero: string;
  osId?: string;
  cliente: string;
  obra: string;
  local: string;
  sup?: string;
  ensaios: EnsaioItemOS[];
}

export function extractSampleDetails(a: any) {
  if (!a) return { furo: "", prof: "", codigo: "" };
  const p = parseGanttSampleData(a);
  return {
    furo: p.furo,
    prof: p.prof,
    codigo: p.codigo || a.codigo_amostra || a.code || a.reportNumber || a.identificacao || "",
  };
}

/**
 * Agrupamento consolidado por OS (labStore + pendências de digitação + Gantt),
 * extraído de OsReportsView pra ser reaproveitado também pelo hub de Ensaios
 * Especiais — evita recalcular a mesma junção duas vezes.
 */
export function useOsGroups() {
  const labState = useLabState();
  const cadastro = useCadastroByOs();
  const { displayName, user, profile } = useAuth();
  const currentUserName = displayName || profile?.nome || user?.email?.split("@")[0] || "Maurício Malanconi";

  const [deletedOs, setDeletedOs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("suporte_infra_deleted_os_v1");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [deletedEnsaios, setDeletedEnsaios] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("suporte_infra_deleted_ensaios_v1");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const listPendenciasFn = useServerFn(listPendenciasDigitacao);
  const rows0Fn = useServerFn(listRows);

  const { data: pendencias = [], refetch: refetchPend } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => listPendenciasFn(),
    refetchInterval: 30_000,
  });

  const { data: progs = [] } = useQuery({
    queryKey: ["prox-ensaios-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
  });

  const { data: amostrasProg = [] } = useQuery({
    queryKey: ["prox-ensaios-amostras"],
    queryFn: async () => rows0Fn({ data: { sheet: "Amostras" } }),
  });

  const { data: ensaiosProg = [] } = useQuery({
    queryKey: ["prox-ensaios-ensaios"],
    queryFn: async () => rows0Fn({ data: { sheet: "Ensaios" } }),
  });

  const { data: tiposProg = [] } = useQuery({
    queryKey: ["prox-ensaios-tipos"],
    queryFn: async () => rows0Fn({ data: { sheet: "Tipos de Ensaio" } }),
  });

  const { data: equipsProg = [] } = useQuery({
    queryKey: ["prox-ensaios-equips"],
    queryFn: async () => rows0Fn({ data: { sheet: "Equipamentos" } }),
  });

  // Agrupamento consolidado por OS com deduplicação rigorosa por Amostra + Tipo de Ensaio
  const osGroups = useMemo<OsGroup[]>(() => {
    const amMap = new Map<string, any>();
    const amByCode = new Map<string, any>();

    for (const a of amostrasProg) {
      if (a.id) amMap.set(String(a.id), a);
      if (a.codigo_amostra) amByCode.set(String(a.codigo_amostra).trim(), a);
      if (a.identificacao) amByCode.set(String(a.identificacao).trim(), a);
      if (a.numero_amostra) amByCode.set(String(a.numero_amostra).trim(), a);
      if (a.os_numero) {
        const nos = normOs(a.os_numero);
        if (a.codigo_amostra) amByCode.set(`${nos}:${String(a.codigo_amostra).trim()}`, a);
        if (a.identificacao) amByCode.set(`${nos}:${String(a.identificacao).trim()}`, a);
        if (a.numero_amostra) amByCode.set(`${nos}:${String(a.numero_amostra).trim()}`, a);
        if (a.id) amByCode.set(`${nos}:${String(a.id).trim()}`, a);
      }
    }

    const enMap = new Map(ensaiosProg.map((e) => [e.id, e]));
    const tpMap = new Map(tiposProg.map((t) => [t.id, t]));

    const groups = new Map<string, { group: OsGroup; itemsMap: Map<string, EnsaioItemOS> }>();

    const getOrCreateGroupData = (osNum: string) => {
      const cleanNum = (osNum || "").trim();
      if (!cleanNum || deletedOs.has(normOs(cleanNum))) return null;
      if (!groups.has(cleanNum)) {
        const cad = cadastro.lookup(cleanNum);
        groups.set(cleanNum, {
          group: {
            osNumero: cleanNum,
            cliente: cad?.tomador || `OS ${cleanNum}`,
            obra: cad?.obra || "",
            local: cad?.local || "",
            sup: cad?.sup || "",
            ensaios: [],
          },
          itemsMap: new Map<string, EnsaioItemOS>(),
        });
      }
      return groups.get(cleanNum)!;
    };

    // Helper para chave canônica única por amostra + metodologia
    const getTestKey = (amostraCodeOrId: string, tipoOrSigla: string) => {
      const amKey = (amostraCodeOrId || "AM-01").trim().toLowerCase();
      const m = detectMethodology(tipoOrSigla, tipoOrSigla) || "cisalhamento-direto";
      return `${amKey}::${m}`;
    };

    // 1. Inclui ensaios do labStore
    for (const os of labState.os) {
      if (deletedOs.has(normOs(os.numero))) continue;
      const gData = getOrCreateGroupData(os.numero);
      if (!gData) continue;
      const { group: g, itemsMap } = gData;
      g.osId = os.id;
      if (os.client && (!g.cliente || g.cliente.startsWith("OS "))) g.cliente = os.client;
      if (!g.obra && os.workNumber) g.obra = os.workNumber;
      if (!g.local && os.local) g.local = os.local;

      for (const am of os.amostras) {
        const amProg =
          amMap.get(am.id) ||
          (am.code ? amByCode.get(`${normOs(os.numero)}:${am.code}`) || amByCode.get(am.code) : undefined) ||
          (am.reportNumber ? amByCode.get(`${normOs(os.numero)}:${am.reportNumber}`) || amByCode.get(am.reportNumber) : undefined);
        const details = extractSampleDetails(amProg);

        for (const en of am.ensaios) {
          const rawSigla = (en as any).sigla || (en as any).ensaioNome || en.nome || (en as any).label || (en as any).codigo;
          const siglaEnsaio = rawSigla && rawSigla !== en.tipo && rawSigla !== ENSAIO_LABEL[en.tipo]
            ? rawSigla
            : ENSAIO_LABEL[en.tipo] || en.tipo;

          const enKey = `${normOs(os.numero)}:${am.reportNumber || am.code}:${siglaEnsaio}`;
          const enIdKey = `${normOs(os.numero)}:${en.id}`;
          if (deletedEnsaios.has(enKey) || deletedEnsaios.has(enIdKey)) continue;

          const sampleIdent = am.code || details.codigo || am.reportNumber || "AM-01";
          const testKey = getTestKey(sampleIdent, en.tipo);

          const item: EnsaioItemOS = {
            id: en.id,
            amostraId: am.id,
            amostra: sampleIdent,
            furo: am.borehole || details.furo || "",
            prof: am.depth || details.prof || "",
            codigo: am.code || details.codigo || "",
            ensaio: siglaEnsaio,
            tipo: en.tipo,
            status: en.status === "concluido" ? "aprovado" : "em_digitacao",
            digitador: en.operator || currentUserName,
            revisao: os.revision || "0",
          };

          itemsMap.set(testKey, item);
        }
      }
    }

    // 2. Inclui ensaios das pendências de digitação
    for (const p of pendencias) {
      if (deletedOs.has(normOs(p.os))) continue;
      const gData = getOrCreateGroupData(p.os);
      if (!gData) continue;
      const { group: g, itemsMap } = gData;

      const m = detectMethodology(p.ensaio, p.tipo_ensaio) || "cisalhamento-direto";
      const tipo = m as EnsaioTipo;
      const amName = p.amostra || "AM-01";
      const enKey = `${normOs(p.os)}:${amName}:${p.ensaio}`;
      const enIdKey = `${normOs(p.os)}:${p.id}`;
      if (deletedEnsaios.has(enKey) || deletedEnsaios.has(enIdKey)) continue;

      const amProg =
        amByCode.get(`${normOs(p.os)}:${p.amostra}`) ||
        amByCode.get(p.amostra || "") ||
        amMap.get(p.amostra || "");
      const details = extractSampleDetails(amProg);

      let st: EnsaioItemOS["status"] = "em_digitacao";
      if (p.status === "digitado") st = "verificacao";
      if (p.status === "aprovado") st = "aprovado";
      if (p.status === "concluido_externo") st = "concluido_externo";

      const sampleIdent = details.codigo || p.amostra || "AM-01";
      const testKey = getTestKey(sampleIdent, tipo);
      const existing = itemsMap.get(testKey);

      if (existing) {
        // Atualiza campos com dados enriquecidos da pendência
        existing.pendenciaId = p.id;
        if (!existing.furo && details.furo) existing.furo = details.furo;
        if (!existing.prof && details.prof) existing.prof = details.prof;
        if (!existing.codigo && details.codigo) existing.codigo = details.codigo;
        // Prioriza a sigla oficial da pendência (ex: "CD4.IN") se existente tiver nome genérico
        if (p.ensaio && (!existing.ensaio || existing.ensaio === existing.tipo || existing.ensaio.includes("cisalhamento-direto"))) {
          existing.ensaio = p.ensaio;
        }
        if (st === "aprovado" || st === "concluido_externo" || st === "verificacao" || st === "em_digitacao") {
          if (existing.status !== "aprovado" && existing.status !== "concluido_externo") {
            existing.status = st;
          }
        }
        if (p.operador_nome) existing.tecnico = p.operador_nome;
        if (p.digitador_nome) existing.digitador = p.digitador_nome;
        if (p.verificador_nome) existing.verificador = p.verificador_nome;
        if (p.aprovador_nome) existing.aprovador = p.aprovador_nome;
      } else {
        itemsMap.set(testKey, {
          id: p.id,
          pendenciaId: p.id,
          amostra: sampleIdent,
          furo: details.furo,
          prof: details.prof,
          codigo: details.codigo,
          ensaio: p.ensaio,
          tipo,
          status: st,
          tecnico: p.operador_nome || undefined,
          digitador: p.digitador_nome || undefined,
          verificador: p.verificador_nome || undefined,
          aprovador: p.aprovador_nome || undefined,
          revisao: "0",
        });
      }
    }

    // 3. Inclui ensaios do Gantt de execução
    for (const prog of progs) {
      const e = enMap.get(prog.ensaio_id ?? "");
      const a = e ? amMap.get(e.amostra_id ?? "") : undefined;
      const t = e ? tpMap.get(e.tipo_ensaio_id ?? "") : undefined;
      const osNum = a?.os_numero;
      if (!osNum || deletedOs.has(normOs(osNum))) continue;

      const gData = getOrCreateGroupData(osNum);
      if (!gData) continue;
      const { group: g, itemsMap } = gData;

      const details = extractSampleDetails(a);
      const sampleIdent = details.codigo || a?.codigo_amostra || a?.identificacao || "—";
      const siglaEnsaio = t?.sigla || t?.codigo || e?.sigla || e?.codigo || t?.nome || "Ensaio";
      const m = detectMethodology(siglaEnsaio, t?.nome) || "cisalhamento-direto";
      const tipo = m as EnsaioTipo;

      const enKey = `${normOs(osNum)}:${sampleIdent}:${siglaEnsaio}`;
      const enIdKey = `${normOs(osNum)}:${prog.id}`;
      if (deletedEnsaios.has(enKey) || deletedEnsaios.has(enIdKey)) continue;

      const testKey = getTestKey(sampleIdent, tipo);
      const existing = itemsMap.get(testKey);

      if (existing) {
        // Melhora furo, prof e sigla com os dados diretos da programação do Gantt
        if (!existing.furo && details.furo) existing.furo = details.furo;
        if (!existing.prof && details.prof) existing.prof = details.prof;
        if (!existing.codigo && details.codigo) existing.codigo = details.codigo;
        if (siglaEnsaio && (!existing.ensaio || existing.ensaio === existing.tipo || existing.ensaio.includes("cisalhamento-direto"))) {
          existing.ensaio = siglaEnsaio;
        }
        if (!existing.tecnico && prog.tecnico) existing.tecnico = prog.tecnico;
      } else {
        const concluiu = !!prog.data_fim_real || prog.status === "concluido";
        const iniciou = !!prog.data_inicio_real || prog.status === "em_execucao";
        const st: EnsaioItemOS["status"] = concluiu ? "em_digitacao" : iniciou ? "execucao" : "programado";

        itemsMap.set(testKey, {
          id: prog.id,
          amostra: sampleIdent,
          furo: details.furo,
          prof: details.prof,
          codigo: details.codigo,
          ensaio: siglaEnsaio,
          tipo,
          status: st,
          tecnico: prog.tecnico || undefined,
          revisao: "0",
        });
      }
    }

    // Monta o array final de ensaios para cada grupo
    const result: OsGroup[] = [];
    for (const { group, itemsMap } of groups.values()) {
      group.ensaios = Array.from(itemsMap.values()).sort((a, b) => a.amostra.localeCompare(b.amostra));
      result.push(group);
    }

    return result.sort((a, b) => a.osNumero.localeCompare(b.osNumero));
  }, [labState, pendencias, progs, amostrasProg, ensaiosProg, tiposProg, equipsProg, cadastro, deletedOs, deletedEnsaios, currentUserName]);

  return {
    osGroups,
    pendencias,
    refetchPend,
    progs,
    amostrasProg,
    ensaiosProg,
    tiposProg,
    equipsProg,
    cadastro,
    currentUserName,
    deletedOs,
    setDeletedOs,
    deletedEnsaios,
    setDeletedEnsaios,
  };
}

/**
 * Acha (ou cria) a OS/amostra/ensaio no labStore e navega pro editor —
 * extraído de OsReportsView pra ser reaproveitado também pelo hub de
 * Ensaios Especiais. `deps` é um subconjunto do retorno de `useOsGroups()`.
 */
export function abrirEnsaioNaCentral(
  navigate: (opts: any) => void,
  deps: {
    cadastro: ReturnType<typeof useCadastroByOs>;
    amostrasProg: any[];
    ensaiosProg: any[];
    progs: any[];
    equipsProg: any[];
    currentUserName: string;
  },
  osNum: string,
  amCode: string,
  tipo: EnsaioTipo,
  siglaOuNome?: string,
) {
  const { cadastro, amostrasProg, ensaiosProg, progs, equipsProg, currentUserName } = deps;

  if (tipo === "mesp-a") {
    navigate({ to: "/relatorio/mesp-a", search: {} });
    return;
  }

  const state = labStore.get();
  let os = state.os.find((o) => (o.numero ?? "").trim() === osNum.trim());
  const cad = cadastro.lookup(osNum);
  const client = cad?.tomador || `OS ${osNum}`;
  const work = cad?.obra || "";
  const loc = cad?.local || "";

  // Tenta resolver dados da amostra e equipamento do Gantt
  const amProg =
    amostrasProg.find((a) => (a.codigo_amostra || a.identificacao || a.id) === amCode && normOs(a.os_numero || "") === normOs(osNum)) ||
    amostrasProg.find((a) => (a.codigo_amostra || a.identificacao) === amCode) ||
    amostrasProg.find((a) => a.id === amCode);
  const details = extractSampleDetails(amProg);

  let equipNome = "";
  if (amProg) {
    const enItem = ensaiosProg.find((e) => e.amostra_id === amProg.id);
    if (enItem) {
      const pItem = progs.find((p) => p.ensaio_id === enItem.id);
      if (pItem?.equipamento_id) {
        const eq = equipsProg.find((eq) => eq.id === pItem.equipamento_id);
        if (eq?.nome) equipNome = eq.nome;
      }
    }
  }

  if (!os) {
    os = labStore.createOS({
      numero: osNum,
      client,
      workNumber: work,
      local: loc,
      technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
    });
  } else {
    let updated = false;
    if ((!os.client || os.client.startsWith("OS ")) && client) { os.client = client; updated = true; }
    if (!os.workNumber && work) { os.workNumber = work; updated = true; }
    if (!os.local && loc) { os.local = loc; updated = true; }
    if (!os.technicalResp || os.technicalResp.includes("Maurício Silva")) {
      os.technicalResp = "Engº Maurício Malanconi - CREA: 5063078630";
      updated = true;
    }
    if (updated) labStore.patchOS(os.id, { client: os.client, workNumber: os.workNumber, local: os.local, technicalResp: os.technicalResp });
  }

  const cleanAm = (amCode || "AM-01").trim();
  let am = os.amostras.find((a) => (a.reportNumber ?? a.code ?? "").trim() === cleanAm);
  if (!am) {
    am = labStore.addAmostra(os.id, {
      reportNumber: cleanAm,
      code: details.codigo || cleanAm,
      borehole: details.furo,
      depth: details.prof,
      sampleType: amProg?.tipo || "Bloco indeformado",
      description: amProg?.descricao || "",
    });
  } else {
    let patchAm: any = {};
    if (!am.borehole && details.furo) patchAm.borehole = details.furo;
    if (!am.depth && details.prof) patchAm.depth = details.prof;
    if (!am.code && details.codigo) patchAm.code = details.codigo;
    if (!am.sampleType && amProg?.tipo) patchAm.sampleType = amProg.tipo;
    if (Object.keys(patchAm).length > 0) {
      labStore.patchAmostra(os.id, am.id, patchAm);
    }
  }

  if (!am) return;

  const siglaEnsaio = siglaOuNome || ENSAIO_LABEL[tipo] || tipo;
  let en = am.ensaios.find((e) => e.tipo === tipo);
  if (!en) {
    en = labStore.addEnsaio(os.id, am.id, tipo, siglaEnsaio);
    if (en) {
      labStore.patchEnsaio(os.id, am.id, en.id, {
        operator: currentUserName,
        nome: siglaEnsaio,
        sigla: siglaEnsaio,
        payload: {
          sample: {
            equipment: equipNome || undefined,
            typedBy: currentUserName,
            operator: currentUserName,
            technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
          },
        },
      });
    }
  } else {
    if (siglaOuNome && siglaOuNome !== ENSAIO_LABEL[tipo]) {
      labStore.patchEnsaio(os.id, am.id, en.id, {
        nome: siglaOuNome,
        sigla: siglaOuNome,
      });
    }
  }

  if (!en) return;

  navigate({
    to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
    params: { osId: os.id, amostraId: am.id, ensaioId: en.id },
    search: {},
  });
}
