import { createContext, useContext } from "react";
import { SKIN_DEFAULT } from "./skin.ts";
import type { Skin } from "./skin.ts";
import { motionOf } from "./skin-style.ts";
import type { Motion } from "./skin-style.ts";

/* ============ The skin in React: provider and hooks ============ */

const Ctx = createContext<Skin>(SKIN_DEFAULT);
export const SkinProvider: React.FC<{ skin: Skin; children: React.ReactNode }> = ({ skin, children }) => <Ctx.Provider value={skin}>{children}</Ctx.Provider>;
/** The current skin (the default skin outside a provider, so code written before skins renders as it always did). */
export const useSkin = (): Skin => useContext(Ctx);
/** Motion of the current skin (`appear`, `pop`, `slide`). */
export const useMotion = (): Motion => motionOf(useSkin());
