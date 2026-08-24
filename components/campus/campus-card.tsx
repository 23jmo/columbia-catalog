"use client";

/**
 * Campus-card lane — the signature card.
 *
 * A small window in the course drawer that answers "where does this section
 * actually meet?" with a stylised isometric model of the right campus, the
 * right building lit up, and everything else pushed back.
 *
 * This file deliberately contains no three.js. It owns the *decisions*:
 *
 *   - Can we render 3D at all (WebGL present, context not lost)?
 *   - Should we (reduced motion, caller override)?
 *   - Is it worth animating right now (on screen, tab visible)?
 *   - What colours does the current theme want?
 *
 * and then hands those answers to `./campus-scene`, which is loaded through
 * `next/dynamic({ ssr: false })` so the three.js chunk is only fetched when the
 * answer to the first two questions is yes. While that chunk is in flight the
 * flat map from `./campus-card-fallback` is already on screen underneath, so
 * there is never a blank frame and never a layout shift — the drawer's
 * open-time budget (spec §19) is not allowed to pay for this card.
 */

import { Component, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { cx } from "@/utils/cx";
import { focusPointFor } from "@/lib/campus";
import { buildCampusCaption } from "./caption";
import { CampusCardFallback, CampusMiniMap } from "./campus-card-fallback";
import type { CampusCardProps, CampusFallbackReason } from "./contracts";
import { highlightedStopBuildings, routePointsOnPlane } from "./route";
import { readCampusPalette } from "./palette";
import type { CampusPalette } from "./palette";

const CampusScene = dynamic(() => import("./campus-scene"), {
  // The scene reads a live WebGL context and the document's computed styles.
  // Neither exists on the server, and a server-rendered canvas would only be
  // thrown away on hydration.
  ssr: false,
  loading: () => null,
});

/** Cached WebGL probe — creating throwaway contexts is not free, and the answer
 * cannot change within a page load. */
let webglSupported: boolean | null = null;

function detectWebgl(): boolean {
  if (webglSupported !== null) return webglSupported;
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    webglSupported = context != null;
  } catch {
    // Firefox with WebGL disabled throws rather than returning null.
    webglSupported = false;
  }
  return webglSupported;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `useSyncExternalStore` rather than state + effect so the very first client
 * render already knows the answer. The server snapshot is `true` — assume
 * reduced motion until proven otherwise, because guessing the other way would
 * flash a canvas at exactly the readers who asked us not to.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => true,
  );
}

/** True once React has hydrated — nothing about the client is knowable before. */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * True only while the card is actually worth animating: on screen, and in a
 * foreground tab. Everything else is a paused `frameloop="demand"` canvas.
 */
function useIsActivelyVisible(element: HTMLElement | null): boolean {
  const [onScreen, setOnScreen] = useState(false);
  // Read once during render: whether the browser can observe intersection at
  // all is fixed for the page, and on the ancient browsers that cannot we
  // simply treat the card as always on screen.
  const [canObserve] = useState(() => typeof IntersectionObserver !== "undefined");

  const tabVisible = useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.visibilityState === "visible",
    () => false,
  );

  useEffect(() => {
    if (!element || !canObserve) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, canObserve]);

  return (onScreen || !canObserve) && tabVisible;
}

/**
 * Resolves the BoardUI tokens against this card's own DOM node, and re-resolves
 * when the theme flips. Watching `class` on <html> is how `styles/globals.css`
 * says dark mode is toggled, so that is what we listen to.
 */
function useCampusPalette(element: HTMLElement | null): CampusPalette | null {
  const [palette, setPalette] = useState<CampusPalette | null>(null);

  useEffect(() => {
    if (!element) return;
    const sync = () => setPalette(readCampusPalette(element));
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [element]);

  return palette;
}

/**
 * A WebGL failure must degrade, never blank the drawer. Any error thrown while
 * rendering the scene swaps in the flat map for good.
 */
class SceneBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CampusCard({
  buildingNames,
  roomLabel,
  label,
  meta,
  className,
  forceFallback = false,
  routeStops,
  connectStops = true,
}: CampusCardProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);

  const mounted = useIsHydrated();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isVisible = useIsActivelyVisible(container);
  const palette = useCampusPalette(container);

  const caption = useMemo(
    () =>
      buildCampusCaption({
        buildingNames: routeStops?.length
          ? highlightedStopBuildings(routeStops)
          : buildingNames,
        roomLabel,
        label,
        meta,
      }),
    [buildingNames, roomLabel, label, meta, routeStops],
  );
  const focus = useMemo(() => focusPointFor(caption.location), [caption.location]);
  const route = useMemo(
    () => (routeStops?.length ? routePointsOnPlane(routeStops, caption.plane) : null),
    [routeStops, caption.plane],
  );

  // WebGL is probed lazily rather than in a hook so it never runs on a card
  // that is going to render flat anyway.
  const hasWebgl = mounted && !forceFallback && !prefersReducedMotion ? detectWebgl() : false;

  const fallbackReason: CampusFallbackReason | null = forceFallback
    ? "forced"
    : prefersReducedMotion
      ? "reduced-motion"
      : sceneFailed || (mounted && !hasWebgl)
        ? "no-webgl"
        : null;

  // Before mount we know nothing about the client, so we render the flat map
  // markup the server produced — identical DOM, no hydration mismatch.
  if (!mounted || fallbackReason !== null) {
    return (
      <CampusCardFallback
        buildingNames={buildingNames}
        roomLabel={roomLabel}
        label={label}
        meta={meta}
        className={className}
        reason={fallbackReason ?? "loading"}
        routeStops={routeStops}
        connectStops={connectStops}
      />
    );
  }

  const flatMap = (
    <CampusMiniMap
      plane={caption.plane}
      pinnedBuildingId={caption.location.layout?.buildingId ?? null}
      focus={focus}
      description={caption.description}
      marker={caption.marker}
      routeStops={routeStops}
      connectStops={connectStops}
      className="absolute inset-0 size-full"
    />
  );

  return (
    <figure
      ref={setContainer}
      className={cx(
        "overflow-hidden rounded-2lg border border-border-table bg-background-primary-default",
        className,
      )}
    >
      <div className="relative aspect-[16/10] bg-background-secondary-default">
        {/* The flat map is the floor, not a spinner: it is already correct, and
            it fades out only once the model has actually drawn a frame. */}
        <div
          className={cx(
            "pointer-events-none absolute inset-0 transition-opacity duration-300",
            sceneReady ? "opacity-0" : "opacity-100",
          )}
          aria-hidden={sceneReady}
        >
          {flatMap}
        </div>

        <div className="absolute inset-0">
          <SceneBoundary fallback={null} onError={() => setSceneFailed(true)}>
            {palette ? (
              <CampusScene
                plane={caption.plane}
                focus={focus}
                pinned={caption.location.layout}
                palette={palette}
                animate={isVisible}
                description={caption.description}
                marker={caption.marker}
                route={route}
                connectStops={connectStops}
                onReady={() => setSceneReady(true)}
                onContextLost={() => {
                  setSceneReady(false);
                  setSceneFailed(true);
                }}
              />
            ) : null}
          </SceneBoundary>
        </div>

        {sceneReady ? (
          <p className="pointer-events-none absolute bottom-1.5 left-2 text-caption-2-regular text-text-tertiary opacity-70">
            Drag to look around
          </p>
        ) : null}
      </div>
    </figure>
  );
}

/** Kept so the drawer can `React.lazy(() => import(".../campus-card"))`. */
export default CampusCard;
