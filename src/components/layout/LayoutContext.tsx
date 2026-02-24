import { createSignal, createContext, useContext, type ParentComponent } from "solid-js";

export type AppPage = "downloads" | "settings";

interface LayoutContextValue {
  sidebarExpanded: () => boolean;
  setSidebarExpanded: (v: boolean) => void;
  toggleSidebar: () => void;
  detailPanelVisible: () => boolean;
  setDetailPanelVisible: (v: boolean) => void;
  toggleDetailPanel: () => void;
  currentPage: () => AppPage;
  setCurrentPage: (page: AppPage) => void;
}

const LayoutContext = createContext<LayoutContextValue>();

export const LayoutProvider: ParentComponent = (props) => {
  const [sidebarExpanded, setSidebarExpanded] = createSignal(true);
  const [detailPanelVisible, setDetailPanelVisible] = createSignal(false);
  const [currentPage, setCurrentPage] = createSignal<AppPage>("downloads");

  const value: LayoutContextValue = {
    sidebarExpanded,
    setSidebarExpanded,
    toggleSidebar: () => setSidebarExpanded((prev) => !prev),
    detailPanelVisible,
    setDetailPanelVisible,
    toggleDetailPanel: () => setDetailPanelVisible((prev) => !prev),
    currentPage,
    setCurrentPage,
  };

  return (
    <LayoutContext.Provider value={value}>
      {props.children}
    </LayoutContext.Provider>
  );
};

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
