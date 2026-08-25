"use client";

import { useEffect, useRef } from "react";

import { Ornament, type OrnamentHue } from "@/components/onboarding/screen";
import { cx } from "@/utils/cx";

/**
 * The medallion, with a face.
 *
 * ── Why the ornament grew eyes ─────────────────────────────────────────────
 *
 * The disc was decoration: a nice object at the top of every onboarding screen
 * that said nothing about what the app was doing. Two ovals turn the same
 * artwork into a character, and a character can carry state that no spinner
 * can — attention (it is looking at you), thought (it is looking away, working),
 * and rest (it is idling, glancing around, waiting on you). That is three
 * pieces of status in the space the decoration already occupied.
 *
 * The body is unchanged Columbia navy. Only the eyes are new, and they are flat
 * white ovals rather than rendered eyeballs, because a pupil needs a sclera, a
 * sclera needs a lid line, and the whole thing stops reading as an emblem and
 * starts reading as a cartoon. Two ovals is the whole face.
 *
 * ── The three moods ────────────────────────────────────────────────────────
 *
 *   resting   idle, and pointedly not looking at you. It holds a three-quarter
 *             turn to one side, swivels slowly to the other, and blinks. A face
 *             that stares out of the screen while nothing is happening is
 *             unnerving; one that is looking off somewhere reads as at ease.
 *   tracking  the head turns to follow the pointer, but only while the pointer
 *             is near something clickable; the rest of the time it idles like
 *             `resting`. Used where the student is being asked something and
 *             the ornament should look like it is watching them answer — the
 *             onboarding screens.
 *   thinking  the gaze breaks upward and swivels faster, and the body turns
 *             underneath the face so the grain boils. Reads as work happening
 *             rather than as a progress bar lying about progress.
 *
 * ── Why the eyes are a sibling of the body, not a child ────────────────────
 *
 * `thinking` rotates the disc. If the eyes rode inside that rotation the face
 * would end up upside down twice a cycle, which is funny once. They sit in a
 * separate absolutely-positioned layer over the same box, so the body can turn
 * as much as it likes and the face stays level.
 *
 * ── Why no React state at all ──────────────────────────────────────────────
 *
 * Pointer tracking at 120Hz through `useState` is 120 re-renders a second of a
 * tree that contains six stacked dither layers. Everything below runs on refs
 * and writes `transform` directly inside one `requestAnimationFrame` loop, so
 * React renders this component exactly once per mood change.
 *
 * `Ornament` is imported and wrapped, never edited — `screen.tsx` belongs to
 * another lane (AGENTS.md rule 3).
 */

export type OrnamentMood = "resting" | "tracking" | "thinking";

/** The intrinsic size `Ornament` paints at. Every constant here is in its units. */
const BODY_SIZE = 92;

/*
 * Eye geometry, and why it is this large.
 *
 * Baby schema: a face reads as cute in proportion to how much of it is eye, how
 * far below the midline they sit, and how far apart they are. Small ovals high
 * on the disc read as a logo — a pair of punctuation marks. The pair below is
 * 54 of the disc's 92 units wide and 32 tall, which is the proportion that stops being an
 * emblem with marks on it and starts being a face. It is deliberately past the
 * point of realism: a real face's eyes are nowhere near this large, and that
 * exaggeration is the entire mechanism the schema runs on.
 */
const EYE_WIDTH = 20;
const EYE_HEIGHT = 32;
const EYE_GAP = 14;
/** Centre of the pair lands at 38, well above the disc's own centre of 46. */
const EYE_TOP = 22;

const EYES_WIDTH = EYE_WIDTH * 2 + EYE_GAP;
const EYE_LEFT_X = (BODY_SIZE - EYES_WIDTH) / 2;
const EYE_RIGHT_X = EYE_LEFT_X + EYE_WIDTH + EYE_GAP;

/*
 * The three-quarter turn.
 *
 * A flat two-oval face has no nose to occlude and no head to rotate, so the
 * turn has to be faked, and translating both eyes sideways alone does not do
 * it — that reads as the eyes sliding around inside a face still pointed at
 * you. What sells it is foreshortening, and which eye foreshortens is the one
 * thing here that is easy to get backwards.
 *
 * Work it out on the object this actually is: a ball with a face painted on
 * it. Put the eyes on the sphere at angles ±φ either side of front, and turn
 * the ball by θ toward the viewer's right. Each eye lands at
 *
 *     x = R · sin(±φ + θ)      width ∝ cos(±φ + θ)
 *
 * The RIGHT eye — the one on the side being turned toward — has its angle grow
 * to φ+θ. It slides further right, and cos(φ+θ) falls, so it is the eye that
 * narrows: it is the one travelling toward the silhouette and about to
 * disappear round the side. The LEFT eye's angle shrinks to θ−φ, so it swings
 * toward the middle at full width, and the gap between the pair closes.
 *
 * The intuition that trips people is thinking of the turned-away eye as the
 * "far" one and shrinking that. On a sphere the trailing eye is not heading
 * anywhere near the limb — it is rotating into the centre of view, where the
 * surface faces the viewer most squarely and nothing is foreshortened at all.
 *
 * So: the LEADING eye takes the `scaleX` squeeze, the TRAILING eye takes an
 * extra nudge of travel that closes the gap, and both ride the shared yaw.
 * The sphere's true numbers are not used directly — at any yaw big enough to
 * read, a real sphere throws the leading eye clean off a disc whose silhouette
 * is not allowed to move — so the shape of the model is kept and the
 * magnitudes are set by eye.
 */
const YAW_TRAVEL = 10.5;
const YAW_CONVERGE = 4.2;
const YAW_FORESHORTEN = 0.46;
/** Vertical is a glance, not a turn, so it stays small. */
const PITCH_TRAVEL = 3.4;

/**
 * Pointer distance, in CSS px, at which the head is fully turned. Roughly a
 * forearm's sweep on a laptop — closer than this and the face would be pinned
 * at full yaw for the whole screen, which stops reading as tracking.
 */
const POINTER_REACH = 340;

/**
 * What counts as worth looking at.
 *
 * `tracking` does not mean "follow the pointer everywhere". A face that locks
 * on the moment the cursor enters the window follows it across dead space, over
 * the headline, out to the scrollbar — and a thing that watches you do nothing
 * is not attentive, it is staring. What makes it read as attention is that it
 * only engages when the pointer is over something the student could actually
 * act on, and looks away again when they drift off it.
 *
 * So the pointer is hit-tested against the controls on the page rather than
 * against the window, and the rest of the time the idle swivel keeps running.
 */
const CLICKABLE_SELECTOR =
  'button, a[href], input, select, textarea, summary, label, [role="button"], [role="option"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])';

/**
 * How far outside a control still counts as approaching it. Generous on
 * purpose: the glance should start on the way to the button, not on contact —
 * arriving at the same instant as the click is a reaction, not attention.
 */
const NEAR_PADDING = 56;

/**
 * Rects go stale on scroll, resize and every re-render of the answer list, and
 * measuring them on every pointer event would be a forced layout per mouse
 * move. A short cache is the whole mitigation: at this age the worst case is
 * one glance aimed at where a button was a third of a second ago.
 */
const RECT_CACHE_MS = 300;

/**
 * Per-frame approach toward the target pose. Deliberately slow: at 60fps this
 * completes a swivel in about six tenths of a second, which is a head turning.
 * Anything much faster snaps, and a snapping head reads as a glitch.
 */
const SWIVEL_EASING = 0.06;

export function OrnamentAvatar({
  hue = "roseBlue",
  mood = "resting",
  size = BODY_SIZE,
  trackNear = CLICKABLE_SELECTOR,
  className,
}: {
  hue?: OrnamentHue;
  mood?: OrnamentMood;
  size?: number;
  /**
   * In `tracking`, the controls the pointer has to be near before the face
   * engages. Narrow it when a surface has chrome the ornament should ignore.
   */
  trackNear?: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const leftGazeRef = useRef<HTMLSpanElement | null>(null);
  const rightGazeRef = useRef<HTMLSpanElement | null>(null);
  const leftLidRef = useRef<HTMLSpanElement | null>(null);
  const rightLidRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    /*
     * Even at rest the face starts turned away — this is the pose the reduced
     * motion path freezes on, so the still frame is still a three-quarter view
     * rather than a mask staring out of the page.
     */
    const currentPose = { yaw: -0.78, pitch: 0.08 };
    const targetPose = { yaw: -0.78, pitch: 0.08 };

    const paint = () => {
      const { yaw, pitch } = currentPose;
      const translateY = pitch * PITCH_TRAVEL;

      for (const [side, eye] of [
        [-1, leftGazeRef.current],
        [1, rightGazeRef.current],
      ] as const) {
        if (!eye) continue;
        // Positive for the eye on the side the face is turning toward — the one
        // travelling to the silhouette, and so the one that foreshortens.
        const leading = Math.max(0, side * yaw);
        // Positive for the other one, which swings toward the middle instead.
        const trailing = Math.max(0, -side * yaw);
        const translateX = yaw * YAW_TRAVEL + yaw * YAW_CONVERGE * trailing;
        const scaleX = 1 - leading * YAW_FORESHORTEN;
        eye.style.transform =
          `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) ` +
          `scaleX(${scaleX.toFixed(3)})`;
      }
    };
    paint();

    if (prefersReducedMotion) return;

    /* ── The swivel ───────────────────────────────────────────────────────
       One loop, two writes. `translate3d` rather than `translate` so the eyes
       get their own compositor layer and the disc's six blended dither layers
       are not repainted on every frame of a turn.                            */
    let animationFrame = 0;
    const step = () => {
      currentPose.yaw += (targetPose.yaw - currentPose.yaw) * SWIVEL_EASING;
      currentPose.pitch += (targetPose.pitch - currentPose.pitch) * SWIVEL_EASING;
      paint();
      animationFrame = requestAnimationFrame(step);
    };
    animationFrame = requestAnimationFrame(step);

    /* ── Blinking ─────────────────────────────────────────────────────────
       A chain of timeouts rather than a CSS keyframe loop, because a real
       blink is irregular. A fixed 4s keyframe is the single clearest tell that
       a face is a graphic; the doubles below are what sell it as alive.       */
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;

    const closeAndOpen = (onDone?: () => void) => {
      for (const lid of [leftLidRef.current, rightLidRef.current]) {
        if (lid) lid.style.transform = "scaleY(0.06)";
      }
      reopenTimer = setTimeout(() => {
        for (const lid of [leftLidRef.current, rightLidRef.current]) {
          if (lid) lid.style.transform = "scaleY(1)";
        }
        onDone?.();
      }, 88);
    };

    const scheduleBlink = () => {
      // Thinking blinks less: a face concentrating on something holds its eyes.
      const minimumDelay = mood === "thinking" ? 1900 : 1000;
      const spread = mood === "thinking" ? 3000 : 2300;
      blinkTimer = setTimeout(() => {
        const isDoubleBlink = Math.random() < 0.36;
        closeAndOpen(
          isDoubleBlink
            ? () => {
                reopenTimer = setTimeout(() => closeAndOpen(scheduleBlink), 130);
              }
            : scheduleBlink,
        );
      }, minimumDelay + Math.random() * spread);
    };
    scheduleBlink();

    /* ── Where it looks ───────────────────────────────────────────────────
       The idle swivel runs in every mood, including `tracking`. It is what the
       face does whenever it is not engaged with something, and in `tracking`
       that is most of the time — the pointer is only near a control for a
       fraction of a session.                                                  */
    const isThinking = mood === "thinking";
    let isEngaged = false;
    let swivelTimer: ReturnType<typeof setTimeout> | undefined;
    let side = 1;

    /*
     * Swivel between the two three-quarter poses, alternating sides so it reads
     * as looking around rather than twitching. It never targets a centred,
     * straight-out-of-the-screen pose: the whole point of the idle state is
     * that it is not watching you.
     */
    const glanceAway = () => {
      side = -side;
      targetPose.yaw = side * (0.62 + Math.random() * 0.38);
      targetPose.pitch = isThinking
        ? // Up and away — the universal "working on it" tell.
          -0.55 - Math.random() * 0.45
        : -0.2 + Math.random() * 0.45;
    };

    const scheduleSwivel = () => {
      swivelTimer = setTimeout(
        () => {
          if (!isEngaged) glanceAway();
          scheduleSwivel();
        },
        isThinking ? 900 + Math.random() * 700 : 2000 + Math.random() * 2600,
      );
    };
    glanceAway();
    scheduleSwivel();

    let removePointerListener: (() => void) | undefined;

    if (mood === "tracking") {
      let cachedRects: DOMRect[] = [];
      let cachedAt = -Infinity;

      const clickableRects = () => {
        const now = performance.now();
        if (now - cachedAt > RECT_CACHE_MS) {
          cachedRects = [...document.querySelectorAll(trackNear)]
            .map((element) => element.getBoundingClientRect())
            // A zero-area rect is a control that is display:none or not laid
            // out yet, and its rect sits at the origin — without this the face
            // stares into the top-left corner of the page.
            .filter((rect) => rect.width > 0 && rect.height > 0);
          cachedAt = now;
        }
        return cachedRects;
      };

      const isNearAControl = (x: number, y: number) =>
        clickableRects().some(
          (rect) =>
            x >= rect.left - NEAR_PADDING &&
            x <= rect.right + NEAR_PADDING &&
            y >= rect.top - NEAR_PADDING &&
            y <= rect.bottom + NEAR_PADDING,
        );

      const onPointerMove = (event: PointerEvent) => {
        if (!isNearAControl(event.clientX, event.clientY)) {
          if (isEngaged) {
            // Break off the moment they leave, rather than holding the last
            // pose until the next scheduled glance — a face frozen mid-turn
            // pointing at nothing is worse than one that was never tracking.
            isEngaged = false;
            clearTimeout(swivelTimer);
            glanceAway();
            scheduleSwivel();
          }
          return;
        }

        isEngaged = true;
        const rect = box.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        targetPose.yaw = clampToUnit(dx / POINTER_REACH);
        targetPose.pitch = clampToUnit(dy / (POINTER_REACH * 0.6));
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      removePointerListener = () =>
        window.removeEventListener("pointermove", onPointerMove);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(blinkTimer);
      clearTimeout(reopenTimer);
      clearTimeout(swivelTimer);
      removePointerListener?.();
    };
  }, [mood, trackNear]);

  const scale = size / BODY_SIZE;

  return (
    <>
      <style href="ornament-avatar" precedence="medium">
        {ORNAMENT_AVATAR_CSS}
      </style>

      <div
        ref={boxRef}
        aria-hidden
        className={cx("relative shrink-0", className)}
        style={{ width: size, height: size }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: BODY_SIZE,
            height: BODY_SIZE,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/*
            The body turns; the face does not. Two nodes because `transform` is
            one property — a rotation and a breathing scale on the same element
            are two declarations fighting over it, and the last one wins.
          */}
          <div className={mood === "thinking" ? "ornament-avatar-turn" : undefined}>
            <div className={mood === "thinking" ? "ornament-avatar-breathe" : undefined}>
              <Ornament hue={hue} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0">
            <Eye x={EYE_LEFT_X} gazeRef={leftGazeRef} lidRef={leftLidRef} />
            <Eye x={EYE_RIGHT_X} gazeRef={rightGazeRef} lidRef={rightLidRef} />
          </div>
        </div>
      </div>
    </>
  );
}

function clampToUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * One oval, in two layers.
 *
 * The outer span carries the head turn (a translate plus the foreshortening
 * squeeze) and the inner one carries the blink (a `scaleY`). They cannot share
 * an element for the same reason the body and the breath cannot: a blink
 * mid-turn would otherwise erase the turn.
 *
 * The transition lives only on the lid, and only on `transform`, so the blink
 * is animated by CSS while the swivel is driven frame by frame from the loop
 * above — putting a transition on the outer span would fight the easing there
 * and turn every head turn to syrup.
 */
function Eye({
  x,
  gazeRef,
  lidRef,
}: {
  x: number;
  gazeRef: React.RefObject<HTMLSpanElement | null>;
  lidRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <span
      ref={gazeRef}
      className="absolute will-change-transform"
      style={{
        left: x,
        top: EYE_TOP,
        width: EYE_WIDTH,
        height: EYE_HEIGHT,
      }}
    >
      <span
        ref={lidRef}
        className="ornament-avatar-lid block size-full rounded-full"
        style={{
          // Not pure #fff. The disc is a grained, dithered surface, and a flat
          // maximum white on top of it reads as a sticker; a hair of warmth at
          // the bottom and an inner shadow at the top seat the oval into the
          // metal instead of floating it above.
          background: "linear-gradient(180deg, #ffffff 0%, #eff3fa 100%)",
          boxShadow:
            "inset 0 1px 1.5px rgba(9,20,45,0.16), 0 1px 3px rgba(6,14,32,0.38)",
        }}
      />
    </span>
  );
}

const ORNAMENT_AVATAR_CSS = `
.ornament-avatar-lid {
  transform: scaleY(1);
  transform-origin: 50% 50%;
  transition: transform 70ms ease-out;
}

/*
  The steps() timing function is the whole effect. Twenty-four poses spread over
  fourteen seconds is about 1.7 frames a second, and time that visibly quantises
  is what the posterized, low-frame-rate look actually is — the pauses between
  poses read as deliberation, where a smooth sweep reads as a spinner waiting on
  a network.

  It also has to be a rotation, not a filter: the grain and dither layers are
  fixed textures, so turning the disc drags them across new pixels every step
  and the surface boils. A brightness filter would pulse the colour and leave
  the texture standing perfectly still.
*/
.ornament-avatar-turn {
  animation: ornament-avatar-turn 14s steps(24, end) infinite;
}
.ornament-avatar-breathe {
  animation: ornament-avatar-breathe 4.4s steps(6, end) infinite alternate;
}
@keyframes ornament-avatar-turn {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes ornament-avatar-breathe {
  from { transform: scale(0.975); filter: brightness(0.97); }
  to { transform: scale(1.025); filter: brightness(1.06) contrast(1.06); }
}

@media (prefers-reduced-motion: reduce) {
  .ornament-avatar-lid { transition: none; }
  .ornament-avatar-turn,
  .ornament-avatar-breathe { animation: none; }
}
`;
