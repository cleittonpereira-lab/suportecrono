// Chaves de abas usadas pelo sistema de permissões.
// Convidado tem acesso a tudo, EXCETO abas com `admin: true`.
// Papéis (admin/gestor/usuario) recebem o default abaixo; overrides ficam em `tab_permissions`.

export type TabKey =
  | "dashboard"
  | "assistente"
  | "entregas"
  | "analises"
  | "saturacao"
  | "gestao"
  | "cadastro_indicadores"
  | "cadastro"
  | "ordens_servico"
  | "alertas"
  | "programacao"
  | "programacao_central"
  | "programacao_gantt"
  | "programacao_dashboard"
  | "programacao_scan"
  | "programacao_planilha"
  | "programacao_equipamentos"
  | "programacao_compatibilidade"
  | "programacao_tipos_ensaio"
  | "digitalizacao"
  | "relatorio"
  | "relatorio_os"
  | "relatorio_pendentes"
  | "relatorio_adensamento"
  | "relatorio_triaxial"
  | "relatorio_mesp_a"
  | "relatorio_emissoes"
  | "chegada_amostras"
  | "relatorio_cisalhamento"
  | "admin_usuarios";

export const TAB_META: Record<TabKey, { label: string; adminOnly?: boolean }> = {
  dashboard: { label: "Dashboard" },
  assistente: { label: "Assistente IA" },
  entregas: { label: "Entregas" },
  analises: { label: "Produtividade" },
  saturacao: { label: "Saturação" },
  gestao: { label: "Gestão de entregas" },
  cadastro_indicadores: { label: "Cadastro de OS (indicadores)" },
  cadastro: { label: "OS cadastradas" },
  ordens_servico: { label: "Painel de OS" },
  alertas: { label: "Alertas" },
  programacao: { label: "Programação · Visão geral" },
  programacao_central: { label: "Programação · Central" },
  programacao_gantt: { label: "Programação · Gantt" },
  programacao_dashboard: { label: "Programação · Dashboard operacional" },
  programacao_scan: { label: "Programação · Leitor QR (mobile)" },
  programacao_planilha: { label: "Programação · Planilha editável (Central)" },
  programacao_equipamentos: { label: "Programação · Equipamentos" },
  programacao_compatibilidade: { label: "Programação · Compatibilidade equip×ensaio" },
  programacao_tipos_ensaio: { label: "Programação · Tipos de ensaio" },
  digitalizacao: { label: "Digitalização de Ensaios" },
  relatorio: { label: "Relatório · Visão geral" },
  relatorio_os: { label: "Relatório · OS / Amostras" },
  relatorio_pendentes: { label: "Relatório · Central de Relatórios & SLAs" },
  relatorio_adensamento: { label: "Relatório · Adensamento" },
  relatorio_triaxial: { label: "Relatório · Triaxial CID" },
  relatorio_mesp_a: { label: "Relatório · M.ESP.A Natural" },
  relatorio_cisalhamento: { label: "Relatório · Cisalhamento Direto" },
  relatorio_emissoes: { label: "Relatório · Emissões" },
  chegada_amostras: { label: "Chegada de amostras" },
  admin_usuarios: { label: "Gestão de usuários", adminOnly: true },
};

export const ALL_TABS = Object.keys(TAB_META) as TabKey[];

// Mapeamento path → tab
export function pathToTab(pathname: string): TabKey | null {
  if (pathname === "/" || pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/assistente")) return "assistente";
  if (pathname.startsWith("/chegada-amostras")) return "chegada_amostras";
  if (pathname.startsWith("/entregas") || pathname.startsWith("/criar-entrega")) return "entregas";
  if (pathname.startsWith("/analises")) return "analises";
  if (pathname.startsWith("/saturacao")) return "saturacao";
  if (pathname.startsWith("/gestao")) return "gestao";
  if (pathname.startsWith("/cadastro-dashboard")) return "cadastro_indicadores";
  if (pathname.startsWith("/cadastro") && pathname.includes("indicadores")) return "cadastro_indicadores";
  if (pathname === "/cadastro" || pathname.startsWith("/cadastro/")) return "cadastro";
  if (pathname.startsWith("/ordens-servico")) return "ordens_servico";
  if (pathname.startsWith("/alertas") || pathname.startsWith("/chamadas") || pathname.startsWith("/os-aprovadas-15d")) return "alertas";
  if (pathname.startsWith("/programacao/central")) return "programacao_central";
  if (pathname.startsWith("/programacao/gantt")) return "programacao_gantt";
  if (pathname.startsWith("/programacao/dashboard")) return "programacao_dashboard";
  if (pathname.startsWith("/programacao/scan")) return "programacao_scan";
  if (pathname.startsWith("/programacao/equipamentos")) return "programacao_equipamentos";
  if (pathname.startsWith("/programacao/compatibilidade")) return "programacao_compatibilidade";
  if (pathname.startsWith("/programacao/tipos-ensaio")) return "programacao_tipos_ensaio";
  if (pathname.startsWith("/programacao")) return "programacao";
  if (pathname.startsWith("/relatorio/digitalizacao")) return "digitalizacao";
  if (pathname.startsWith("/relatorio/os")) return "relatorio_os";
  if (pathname.startsWith("/relatorio/pendentes")) return "relatorio_pendentes";
  if (pathname.startsWith("/relatorio/adensamento")) return "relatorio_adensamento";
  if (pathname.startsWith("/relatorio/triaxial-cid")) return "relatorio_triaxial";
  if (pathname.startsWith("/relatorio/mesp-a-natural") || pathname.startsWith("/relatorio/mesp-a")) return "relatorio_mesp_a";
  if (pathname.includes("/relatorio/cisalhamento-direto") || pathname.includes("/modelos-relatorios/cisalhamento-direto")) return "relatorio_cisalhamento";
  if (pathname.startsWith("/relatorio/emissoes")) return "relatorio_emissoes";
  if (pathname.startsWith("/relatorio")) return "relatorio";
  if (pathname.startsWith("/admin/usuarios")) return "admin_usuarios";
  return null;
}