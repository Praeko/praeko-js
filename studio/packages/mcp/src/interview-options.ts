// The closed lists of the brand interview, as the Studio CLI accepts them (studio/packages/cli/src/styles.ts). This package runs the CLI and does not bundle it,
// so the lists are repeated here; a test compares them with the CLI's.
export const STUDIO_SOURCES = ["script", "video"] as const;
export const STUDIO_FORMATS = ["short", "long", "carousel", "image"] as const;
export const STUDIO_STYLES = ["flat", "minimal", "neon", "comic", "chalkboard", "pixel", "8bit", "retro-crt", "clay-3d", "blocks-3d", "retro-3d", "cinema-3d"] as const;
