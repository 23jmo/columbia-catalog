"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * Dev-only dial for the drawer's motion. Delete once the numbers are settled.
 *
 * ── Why a live control instead of editing numbers ──────────────────────────
 *
 * Motion is the one part of an interface you cannot review by reading. 90ms
 * against 120ms is not a judgement anyone can make from a diff, and the
 * edit-reload-click-watch loop is slow enough that by the time the drawer
 * opens you are no longer comparing it to the version you are trying to beat.
 * Dragging a slider while the panel is on screen collapses that to a
 * side-by-side you can actually feel.
 *
 * It writes CSS custom properties on `<html>`, which is the whole trick: the
 * drawer reads the same properties with its real defaults baked into the
 * `var()` fallbacks, so nothing here is load-bearing. Unmount this component
 * and the drawer keeps its shipped timings. The dial has no import from the
 * drawer and the drawer has no import from the dial.
 *
 * ── Removing it ────────────────────────────────────────────────────────────
 *
 * "Copy CSS" prints the current values. Paste the numbers into
 * `DEFAULT_ENTER_MS` / `DEFAULT_EXIT_MS` and the `var()` fallbacks in
 * `app/course/[courseId]/course-drawer.tsx`, delete this file, and drop the
 * mount from `app/layout.tsx`. Nothing else references it.
 *
 * Guarded by `NODE_ENV` at the mount site, so this whole tree is dropped from
 * the production bundle rather than shipped and hidden.
 */

const STORAGE_KEY = "drawer-motion-dial";

/** Must match the `var()` fallbacks in `course-drawer.tsx`. */
const SHIPPED = {
  enter: 90,
  exit: 60,
  distance: 100,
  easeEnter: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeExit: "cubic-bezier(0.4, 0, 1, 1)",
};

type Settings = typeof SHIPPED;

/**
 * Named curves rather than a free-text field.
 *
 * The useful range for a panel is small, and the names say what each one does
 * to the motion, which a string of four numbers does not.
 */
const EASINGS = [
  { label: "soft settle", value: "cubic-bezier(0.22, 1, 0.36, 1)" },
  { label: "standard out", value: "cubic-bezier(0, 0, 0.2, 1)" },
  { label: "standard in", value: "cubic-bezier(0.4, 0, 1, 1)" },
  { label: "snap", value: "cubic-bezier(0.3, 1.4, 0.5, 1)" },
  { label: "linear", value: "linear" },
];

function applyToDocument(next: Settings) {
  const root = document.documentElement.style;
  root.setProperty("--drawer-enter", `${next.enter}ms`);
  root.setProperty("--drawer-exit", `${next.exit}ms`);
  root.setProperty("--drawer-distance", `${next.distance}%`);
  root.setProperty("--drawer-ease-enter", next.easeEnter);
  root.setProperty("--drawer-ease-exit", next.easeExit);
}

function readStored(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SHIPPED;
    // Spread over the defaults so a stored blob written by an older version of
    // this file cannot leave a property undefined.
    return { ...SHIPPED, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return SHIPPED;
  }
}

/*
 * A real external store rather than state seeded from an effect.
 *
 * The settings live outside React because their source (localStorage) does not
 * exist on the server: seeding `useState` from it would hydrate a different
 * value than the server rendered, and setting it from an effect is a cascading
 * render. `useSyncExternalStore` is the primitive built for exactly this --
 * the server snapshot is the shipped defaults, the client snapshot is whatever
 * was stored, and React does the changeover. Same shape as `hooks/use-plans.ts`.
 *
 * The snapshot has to be referentially stable or React re-renders forever, so
 * `current` is replaced only on an actual mutation.
 */
let current: Settings = SHIPPED;
let hasHydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!hasHydrated) {
    hasHydrated = true;
    current = readStored();
    applyToDocument(current);
    // After the commit that subscribed, never during it.
    queueMicrotask(emit);
  }
  return () => {
    listeners.delete(onChange);
  };
}

function writeSettings(next: Settings) {
  current = next;
  applyToDocument(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode, quota — the dial still works for this session */
  }
  emit();
}

function clearSettings() {
  current = SHIPPED;
  applyToDocument(SHIPPED);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clean up */
  }
  emit();
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-caption-2-medium text-text-secondary">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 flex-1 cursor-pointer accent-accent-600"
      />
      <span className="w-14 shrink-0 text-right font-mono text-caption-2-regular tabular-nums text-text-primary">
        {value}
        {unit}
      </span>
    </label>
  );
}

function EasingSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-caption-2-medium text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex-1 rounded-lg border border-border-table bg-background-primary-default px-2 py-1 text-caption-2-regular text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        {EASINGS.map((easing) => (
          <option key={easing.value} value={easing.value}>
            {easing.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DrawerMotionDial() {
  const settings = useSyncExternalStore(subscribe, () => current, () => SHIPPED);
  const [isOpen, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      writeSettings({ ...settings, ...patch });
      setCopied(false);
    },
    [settings],
  );

  const reset = useCallback(() => {
    clearSettings();
    setCopied(false);
  }, []);

  const copy = useCallback(() => {
    const text = [
      `const DEFAULT_ENTER_MS = ${settings.enter};`,
      `const DEFAULT_EXIT_MS = ${settings.exit};`,
      `--drawer-distance: ${settings.distance}%;`,
      `--drawer-ease-enter: ${settings.easeEnter};`,
      `--drawer-ease-exit: ${settings.easeExit};`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [settings]);

  const isDirty =
    settings.enter !== SHIPPED.enter ||
    settings.exit !== SHIPPED.exit ||
    settings.distance !== SHIPPED.distance ||
    settings.easeEnter !== SHIPPED.easeEnter ||
    settings.easeExit !== SHIPPED.easeExit;

  /*
   * Above the drawer's own `z-100`. The panel is the thing being tuned, so the
   * dial has to stay reachable while it is open — a control you have to close
   * the subject to touch is not a live control.
   */
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-1/2 z-200 -translate-x-1/2 rounded-full border border-border-table bg-background-primary-default px-3 py-1.5 text-caption-2-medium text-text-secondary shadow-lg transition-colors hover:text-text-primary"
      >
        drawer motion{isDirty ? " ·" : ""}
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-200 flex w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-border-table bg-background-primary-default p-3 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-caption-2-semibold tracking-[0.04em] text-text-primary uppercase">
          drawer motion
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-1.5 text-caption-2-medium text-text-tertiary transition-colors hover:text-text-primary"
        >
          hide
        </button>
      </div>

      <Slider
        label="enter"
        value={settings.enter}
        min={0}
        max={600}
        step={10}
        unit="ms"
        onChange={(enter) => update({ enter })}
      />
      <Slider
        label="exit"
        value={settings.exit}
        min={0}
        max={600}
        step={10}
        unit="ms"
        onChange={(exit) => update({ exit })}
      />
      <Slider
        label="distance"
        value={settings.distance}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(distance) => update({ distance })}
      />
      <EasingSelect
        label="ease in"
        value={settings.easeEnter}
        onChange={(easeEnter) => update({ easeEnter })}
      />
      <EasingSelect
        label="ease out"
        value={settings.easeExit}
        onChange={(easeExit) => update({ easeExit })}
      />

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-border-table px-2 py-1 text-caption-2-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          reset
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-border-table px-2 py-1 text-caption-2-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {copied ? "copied" : "copy values"}
        </button>
        <span className="ml-auto font-mono text-caption-2-regular tabular-nums text-text-tertiary">
          {settings.enter}/{settings.exit}
        </span>
      </div>
    </div>
  );
}
