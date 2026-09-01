import { createContext, useState, useContext } from "react";

const LangContext = createContext();
export const useLang = () => useContext(LangContext);

export const LangProvider = ({ children }) => {
  const [lang, setLang] = useState("pt");
  
  const t = {
    pt: {
      dashboard: "Dashboard", inspections: "Inspeções", alerts: "Alertas", reports: "Relatórios",
      monthly_report: "Relatório Mensal", users: "Utilizadores", locations: "Localizações",
      templates: "Templates", audit: "Auditoria", settings: "Configurações",
      welcome: "Bem-vindo", quick_start: "Início Rápido", new_inspection: "Nova Inspeção",
      assigned: "Atribuídas", drafts: "Rascunhos Inacabados", recent_activity: "Atividade Recente",
      no_drafts: "Nenhum rascunho encontrado.", no_assigned: "Sem inspeções atribuídas.", no_recent: "Sem atividade recente.",
      start: "Iniciar", continue: "Continuar", resolve: "Resolver", resolved: "Resolvidos"
    },
    en: {
      dashboard: "Dashboard", inspections: "Inspections", alerts: "Alerts", reports: "Reports",
      monthly_report: "Monthly Report", users: "Users", locations: "Locations",
      templates: "Templates", audit: "Audit Log", settings: "Settings",
      welcome: "Welcome", quick_start: "Quick start", new_inspection: "New Inspection",
      assigned: "Assigned", drafts: "Unfinished Drafts", recent_activity: "Recent Activity",
      no_drafts: "No drafts found.", no_assigned: "No assigned inspections.", no_recent: "No recent activity.",
      start: "Start", continue: "Continue", resolve: "Resolve", resolved: "Resolved"
    }
  };
  
  const toggle = () => setLang(l => l === "pt" ? "en" : "pt");
  return <LangContext.Provider value={{ lang, t: t[lang], toggle }}>{children}</LangContext.Provider>;
};
