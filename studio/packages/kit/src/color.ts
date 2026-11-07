import type { Theme } from "@praeko/studio-core";

/** Resolves a theme color name (`accent`, `muted`, ...) or a `#hex` value to a CSS color; unknown names are returned as they are. */
export const resolveColor = (theme: Theme, name?: string): string | undefined => {
  if (!name) return undefined;
  if (name.startsWith("#")) return name;
  const value = (theme as unknown as Record<string, string | undefined>)[name];
  return value ?? name;
};
