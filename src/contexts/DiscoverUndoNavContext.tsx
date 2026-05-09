import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DiscoverUndoNavState = {
  /** Violet + badge : le serveur indique une action rewindable tout de suite */
  undoAvailable: boolean;
  /** Tap autorisé (bêta undo gratuit même sans évidence « badge », pour message ou tentative rewind). */
  undoNavTapEnabled: boolean;
  undoBadgeText: string | null;
  undoBusy: boolean;
  triggerUndo: () => void;
};

const DEFAULT_UNDO_NAV: DiscoverUndoNavState = {
  undoAvailable: false,
  undoNavTapEnabled: false,
  undoBadgeText: null,
  undoBusy: false,
  triggerUndo: () => {},
};

type Ctx = {
  state: DiscoverUndoNavState;
  setDiscoverUndoNav: (next: DiscoverUndoNavState | null) => void;
};

const DiscoverUndoNavContext = createContext<Ctx | null>(null);

export function DiscoverUndoNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DiscoverUndoNavState>(DEFAULT_UNDO_NAV);
  const setDiscoverUndoNav = useCallback((next: DiscoverUndoNavState | null) => {
    setState(next ?? DEFAULT_UNDO_NAV);
  }, []);
  const value = useMemo(
    () => ({
      state,
      setDiscoverUndoNav,
    }),
    [state, setDiscoverUndoNav],
  );
  return <DiscoverUndoNavContext.Provider value={value}>{children}</DiscoverUndoNavContext.Provider>;
}

export function useDiscoverUndoNavState(): DiscoverUndoNavState {
  const ctx = useContext(DiscoverUndoNavContext);
  return ctx?.state ?? DEFAULT_UNDO_NAV;
}

export function useDiscoverUndoNavRegistration(): (next: DiscoverUndoNavState | null) => void {
  const ctx = useContext(DiscoverUndoNavContext);
  if (!ctx) {
    throw new Error("DiscoverUndoNavProvider is missing.");
  }
  return ctx.setDiscoverUndoNav;
}
