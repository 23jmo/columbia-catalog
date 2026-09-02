import { EB_Garamond } from "next/font/google";

/**
 * The display serif, scoped to the landing page.
 *
 * ── Why a serif at all ─────────────────────────────────────────────────────
 *
 * The whole app is Inter, and `styles/theme.css` is the Figma export — one
 * family, no display face, and that file is not ours to extend. A serif
 * headline is therefore a deliberate exception living exactly one route deep:
 * it is the strongest signal a marketing page has that it is a different kind
 * of surface from the product behind it, and for a course planner attached to
 * a university it happens to be the right register anyway.
 *
 * ── Why it is loaded here and not in `app/layout.tsx` ──────────────────────
 *
 * `next/font` must be called at module scope, but the module does not have to
 * be the root layout. Declaring it here means the CSS variable and the font
 * files are requested by the pages that import this module — the landing page
 * — and every signed-in route keeps the two families it already had. Adding a
 * third face to the root layout would put a display serif in the critical
 * path of the feed, which never renders one.
 *
 * `variable` and not `className`: the wrapper sets the variable once, and the
 * headings opt in with `font-[family-name:var(--font-display-serif)]`. There
 * is no `--font-serif` theme token to add, because `styles/**` is frozen.
 */
export const displaySerif = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-serif",
  display: "swap",
});
