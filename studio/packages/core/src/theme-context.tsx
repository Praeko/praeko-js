import { createContext, useContext } from "react";
import { DEFAULT_THEME } from "./theme.ts";
import type { Theme } from "./theme.ts";

const Ctx = createContext<Theme>(DEFAULT_THEME);
export const ThemeProvider: React.FC<{ theme: Theme; children: React.ReactNode }> = ({ theme, children }) => <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
export const useTheme = (): Theme => useContext(Ctx);
