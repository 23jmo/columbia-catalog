"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { RiArrowGoBackLine, RiBookmarkFill, RiCloseLine } from "@remixicon/react";

import { showSignInToast } from "@/components/bookmarks/bookmark-toasts";
import { toggleBookmark } from "@/lib/bookmarks/store";
import { haptic } from "@/lib/haptics";
import type { FeedCard } from "@/lib/recommend/feed";
import { showToast } from "@/lib/toast/store";
import { cx } from "@/utils/cx";

import {
  COMMIT_PX,
  DISCARDS_BEFORE_REFINE,
  SAVES_BEFORE_HANDOFF,
  type SwipeAction,
  milestoneFor,
  swipeVerdict,
} from "./swipe-rules";

import {
  getDismissed,
  getDismissedServerSnapshot,
  setDismissed,
  subscribeDismissed,
} from "./dismissed-store";
import { FeedCardView } from "./feed-card";
import { FEED_CARD_SLOT, FeedGrid } from "./feed-layout";

/**
 * The feed you can act on without opening anything.
 *
 * ── Why a swipe on a list and not a deck ───────────────────────────────────
 *
 * A Tinder deck was the first idea and it was the wrong one for this: choosing
 * a class is a comparison task, and a deck shows you exactly one card, so the
 * question it can answer is "do I like this" rather than "which of these". The
 * list stays a list — ranked, scrollable, all of it visible — and the swipe is
 * an accelerator laid on top of it. Nothing is hidden behind the gesture; the
 * bookmark button in the card's corner does the same thing, and the card is
 * still a link to the full page.
 *
 * That also decides the direction convention. Right is save and left is
 * discard, which is the one convention a student already has, and both are
 * reversible — which matters more here than the convention does, because a
 * swipe is the easiest gesture in the world to fire by accident while
 * scrolling a phone.
 *
 * ── The gesture is borrowed on purpose ─────────────────────────────────────
 *
 * Green behind a right swipe, red behind a left one, and the card leans into
 * the direction it is going. All three are quotations, and quoting is the
 * point: this gesture has one shared vocabulary and a student arrives already
 * fluent in it. Red in particular is not decoration — a neutral grey behind a
 * discard says "moving", where the swipe is about to hide the course, and the
 * two halves of a symmetric gesture have to be as distinguishable at a glance
 * as the outcomes are.
 *
 * The tilt is derived from the drag rather than animated at the threshold, so
 * it is continuous, and so it carries into the exit for free — a card that
 * commits keeps leaning as it clears the column.
 *
 * ── Undo is a residual, not a toast ────────────────────────────────────────
 *
 * When a card goes, its slot does not close up. It becomes a thin row saying
 * what happened with an Undo on it, and only after that row times out does the
 * list actually reflow. Two reasons. A toast puts the undo in the corner of the
 * screen, which is nowhere near where the student is looking; the residual puts
 * it exactly where the card was. And the delayed reflow is what stops the next
 * card from leaping up under a thumb that is still moving — the single most
 * common way a swipe list produces a second, unintended swipe.
 *
 * ── Discards live in this browser ──────────────────────────────────────────
 *
 * `localStorage`, not the database. A discard is a "not this one, not now"
 * about a ranked list that is recomputed every visit, and it is not worth a
 * table or a migration to remember it across devices. It survives a refresh,
 * which is the part that would otherwise feel broken, and `buildFeed` already
 * takes `excludeCourseIds` if this ever needs to become a real preference.
 *
 * Bookmarks are the opposite and already have their own store: a save is a
 * decision the student will act on from another device, so a swipe right calls
 * the same `toggleBookmark` the button does and gets the same optimistic
 * update, the same rollback, and the same signed-out gate.
 */

/** How long the undo row stays before the list closes over it. */
const RESIDUAL_MS = 6000;

/*
 * The thresholds and the milestone rule live in `swipe-rules.ts`, where they
 * can be tested without a DOM. `fired` below is what makes each milestone
 * once-per-page: a prompt that reappears every third save is not a suggestion,
 * it is a nag, and the student has already seen where /saved is.
 */


type Residual = { courseId: string; action: SwipeAction; label: string };

export function FeedDeck({ cards }: { cards: readonly FeedCard[] }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  /*
   * Read straight from the store, not copied into state on mount.
   *
   * `localStorage` does not exist on the server, so this cannot be a plain
   * `useState` initializer — the first client render would disagree with the
   * HTML it is hydrating. Seeding it from an effect instead was the first fix,
   * and it costs a visible flash of already-discarded cards; see
   * `dismissed-store.ts`.
   */
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissed,
    getDismissedServerSnapshot,
  );
  /*
   * Every card that has been swiped this visit, whichever way.
   *
   * A saved card has to leave the list too, and for a reason that is not
   * aesthetic. `toggleBookmark` toggles: if a saved card stayed in the queue,
   * the second right-swipe on it would UNSAVE the course while the tally below
   * counted it as another save — three swipes on one card would then announce
   * a shortlist of one that is no longer even bookmarked.
   *
   * In memory and not on disk, unlike `dismissed`. A discard means "stop
   * showing me this"; a save means "I have dealt with this", and on the next
   * visit a saved course is a perfectly good recommendation to see again —
   * wearing a filled bookmark, which is the state that persisted.
   */
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set());
  const [residuals, setResiduals] = useState<readonly Residual[]>([]);
  const [hintCourseId, setHintCourseId] = useState<string | null>(null);
  /*
   * Which way a card that is coming back should come back FROM.
   *
   * Undo used to just re-render the card, which put a 200px object into a
   * 44px hole between two frames with nothing in between — the reader's
   * account of it is "it just appears". A throw that can be taken back has to
   * be visibly taken back, so the card flies in from the same edge it left by,
   * which is also the only motion that explains where it went.
   *
   * Keyed by course rather than a single value because two residuals can be
   * on screen at once and either can be undone first.
   */
  const [returningFrom, setReturningFrom] = useState<ReadonlyMap<string, 1 | -1>>(new Map());

  const counts = useRef({ saved: 0, discarded: 0 });
  const fired = useRef({ handoff: false, refine: false });
  const timers = useRef(new Map<string, number>());

  // Every pending residual owns a timer; a route change mid-countdown would
  // otherwise leave them running against an unmounted component.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  /*
   * The hint: the top card rocks left and right once, on load.
   *
   * Every visit, not just the first. It was gated on a "have they swiped here
   * before" flag, and the flag was the wrong instinct — this is a browsing
   * page a student opens repeatedly across registration week, usually days
   * apart, and a gesture with no visible affordance is not learned once. The
   * cost of repeating it is a second of movement on a page they have just
   * opened; the cost of getting it wrong is a feature nobody finds.
   *
   * `reduceMotion` still skips it outright: this is decoration in the
   * strictest sense, since the bookmark button and the card's own link already
   * do everything the swipe does.
   */
  useEffect(() => {
    if (reduceMotion) return;
    const first = cards[0];
    if (!first) return;
    const id = window.setTimeout(() => setHintCourseId(first.courseId), 550);
    return () => window.clearTimeout(id);
  }, [cards, reduceMotion]);

  const settle = useCallback((courseId: string) => {
    setResiduals((rows) => rows.filter((row) => row.courseId !== courseId));
    timers.current.delete(courseId);
  }, []);

  const undo = useCallback(
    (row: Residual) => {
      haptic("selection");
      const timer = timers.current.get(row.courseId);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(row.courseId);

      setHandled((set) => {
        const next = new Set(set);
        next.delete(row.courseId);
        return next;
      });
      if (row.action === "discarded") {
        const next = new Set(getDismissed());
        next.delete(row.courseId);
        setDismissed(next);
      }
      // A save is undone by toggling it back off — the same call, which keeps
      // the optimistic state and the server in step without a second path.
      if (row.action === "saved") {
        const card = cards.find((entry) => entry.courseId === row.courseId);
        if (card) void toggleBookmark(card.best.sectionId);
      }

      /*
       * And the tally comes back down. Without this, an undone save still
       * counts toward the shortlist, and the handoff toast can fire on a
       * student who has two courses saved — which is exactly the prompt
       * arriving before the thing it is congratulating them for.
       */
      const tally = counts.current;
      if (row.action === "saved") tally.saved = Math.max(0, tally.saved - 1);
      else tally.discarded = Math.max(0, tally.discarded - 1);

      setReturningFrom((map) => new Map(map).set(row.courseId, row.action === "saved" ? 1 : -1));
      setResiduals((rows) => rows.filter((entry) => entry.courseId !== row.courseId));
    },
    [cards],
  );

  /*
   * Returns whether the card should stay thrown. A false tells SwipeableCard
   * to spring back — used when a save is refused, so the throw that already
   * started from the drag position does not leave a hole with no residual.
   */
  const commit = useCallback(
    async (card: FeedCard, action: SwipeAction): Promise<boolean> => {
      setHintCourseId(null);
      // A card being thrown again is not a card coming back; clear the entrance
      // so an undo-then-reswipe does not fly in from the wrong edge next time.
      setReturningFrom((map) => {
        if (!map.has(card.courseId)) return map;
        const next = new Map(map);
        next.delete(card.courseId);
        return next;
      });

      if (action === "saved") {
        const result = await toggleBookmark(card.best.sectionId);
        /*
         * A refusal must not consume the card. `denied` is the signed-out gate
         * and `failed` is the network; in both cases the student's swipe did
         * not do what it looked like it did, so the card stays exactly where it
         * was and the existing toast explains why.
         */
        if (result.kind === "denied") {
          showSignInToast();
          return false;
        }
        if (result.kind === "failed" || result.kind === "busy") return false;
        haptic("success");
      } else {
        // Discards alone are written to disk; see `handled` above.
        haptic("selection");
        setDismissed(new Set(getDismissed()).add(card.courseId));
      }

      setHandled((set) => new Set(set).add(card.courseId));
      setResiduals((rows) => [
        ...rows.filter((row) => row.courseId !== card.courseId),
        { courseId: card.courseId, action, label: card.code },
      ]);
      timers.current.set(
        card.courseId,
        window.setTimeout(() => settle(card.courseId), RESIDUAL_MS),
      );

      // Milestones read the running tally, not the list length: a card that was
      // saved and then undone should not count toward a shortlist.
      const tally = counts.current;
      if (action === "saved") tally.saved += 1;
      else tally.discarded += 1;

      const milestone = milestoneFor(action, tally, fired.current);
      if (milestone === "handoff") {
        fired.current.handoff = true;
        showToast({
          title: `That is ${SAVES_BEFORE_HANDOFF} saved.`,
          description:
            "Now that you have picked a few, take them over to Vergil to register.",
          status: "success",
          /*
           * Longer than the 5s default and no `dismiss` on the action. This is
           * the one toast on the page that is a suggestion rather than a
           * receipt, and five seconds is not long enough to read a sentence,
           * decide, and reach for a button.
           */
          duration: 9000,
          dedupeKey: "feed-handoff",
          action: { label: "Add to Vergil", onPress: () => router.push("/saved") },
        });
      }
      if (milestone === "refine") {
        fired.current.refine = true;
        showToast({
          title: `${DISCARDS_BEFORE_REFINE} in a row is a signal.`,
          description: "Tell the assistant what you actually want and it will re-rank from that.",
          status: "info",
          duration: 9000,
          dedupeKey: "feed-refine",
          action: { label: "Refine in chat", onPress: () => router.push("/chat") },
        });
      }
      return true;
    },
    [router, settle],
  );

  const residualFor = (courseId: string) => residuals.find((row) => row.courseId === courseId);

  return (
    <FeedGrid>
      {cards.map((card, index) => {
        const row = residualFor(card.courseId);
        // Gone for good only once its residual has timed out. The sets are
        // written the instant the swipe commits, so a refresh mid-countdown
        // still respects a discard; the residual is what holds the slot open
        // until then.
        if (!row && (handled.has(card.courseId) || dismissed.has(card.courseId))) return null;

        /*
         * Which way this card leaves. `AnimatePresence` hands its `custom`
         * to the child that is exiting, and by the time a card is exiting its
         * residual already exists — so the residual's own action is the
         * direction, with no extra state to keep in step.
         */
        const leaving = row ? (row.action === "saved" ? 1 : -1) : 0;

        return (
          <motion.li
            key={card.courseId}
            className={FEED_CARD_SLOT}
            /*
             * `layout` is what turns the reflow into a movement. When a
             * residual times out its slot closes, and without this the four
             * cards below it teleport upward by ~64px. With it they slide, and
             * the reader keeps their place in the list.
             */
            layout
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              // Capped: past about half a second of stagger the last cards
              // feel like they are loading rather than arriving, and this list
              // is twenty-four long.
              delay: Math.min(index * 0.05, 0.45),
              duration: 0.42,
              ease: [0.16, 1, 0.3, 1],
              layout: { type: "spring", stiffness: 380, damping: 40 },
            }}
          >
            <AnimatePresence initial={false} mode="wait" custom={leaving}>
              {row ? (
                <UndoResidual key="residual" row={row} onUndo={() => undo(row)} />
              ) : (
                <SwipeableCard
                  key="card"
                  card={card}
                  hinting={hintCourseId === card.courseId}
                  returningFrom={returningFrom.get(card.courseId) ?? null}
                  reduceMotion={Boolean(reduceMotion)}
                  onCommit={(action) => commit(card, action)}
                />
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </FeedGrid>
  );
}

/* ==========================================================================
 * One card, on rails
 * ========================================================================== */

function SwipeableCard({
  card,
  hinting,
  returningFrom,
  reduceMotion,
  onCommit,
}: {
  card: FeedCard;
  hinting: boolean;
  /** `1` or `-1` when this card is being un-swiped; `null` on an ordinary mount. */
  returningFrom: 1 | -1 | null;
  reduceMotion: boolean;
  /** Resolves false when the action was refused — the card must spring back. */
  onCommit: (action: SwipeAction) => Promise<boolean>;
}) {
  const x = useMotionValue(0);
  /*
   * Direction of a committed throw, set the instant the gesture counts.
   *
   * Left-swipe (discard) used to look fine and right-swipe (save) did not,
   * for one reason: discard writes the residual in the same tick as the drag
   * end, so AnimatePresence's exit continues from the thumb. Save awaits
   * `toggleBookmark` first. In that gap `animate={{ x: 0 }}` and the
   * dragConstraints spring both pull the card home, and the exit only starts
   * once the bookmark returns — from centre. Setting `animate` to undefined
   * was not enough; Motion still snaps to the constraints on release.
   *
   * Aiming at ±520 here keeps the throw going from wherever the thumb left
   * it, matching the exit variant, while the parent finishes the side effect.
   * A refused save clears this and the spring returns the card.
   */
  const [throwDir, setThrowDir] = useState<1 | -1 | null>(null);

  /*
   * The backdrop reads the same motion value the card does, so the green and
   * the red are a function of where the card actually is rather than of a
   * state flag set at a threshold. That is what makes the gesture feel
   * attached: the colour arrives gradually and, crucially, retreats if the
   * student changes their mind halfway.
   *
   * Full strength lands at `COMMIT_PX` — the point the card would actually go —
   * so the colour is a readout of the threshold, not decoration near it.
   */
  const saveOpacity = useTransform(x, [0, COMMIT_PX], [0, 1]);
  const discardOpacity = useTransform(x, [-COMMIT_PX, 0], [1, 0]);

  /*
   * The tilt.
   *
   * A card that slides flat reads as a panel being dragged; a card that leans
   * into the direction it is going reads as an object being thrown, which is
   * the whole reason this gesture feels decisive. Nine degrees at full travel
   * — enough to see, small enough that a two-line title does not visibly go
   * off level while the reader is still deciding.
   *
   * It is derived from `x` rather than animated, so it comes for free on the
   * exit too: the card flies to ±480, this transform clamps at its end stop,
   * and the throw is already leaning by the time it clears the edge.
   */
  const rotate = useTransform(x, [-COMMIT_PX * 3, 0, COMMIT_PX * 3], [-9, 0, 9]);

  return (
    <div className="relative flex w-full min-w-0">
      {/*
        Behind the card, and inert. `rounded-2xl` matches the card exactly so
        the colour never shows past a corner, and `overflow-hidden` is what
        keeps the icons from sliding out of the shape on a long drag.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      >
        <motion.div
          style={{ opacity: saveOpacity }}
          className="absolute inset-0 flex items-center justify-start bg-status-lime-background px-5"
        >
          <RiBookmarkFill className="size-6 text-status-lime-text" />
        </motion.div>
        <motion.div
          style={{ opacity: discardOpacity }}
          className="absolute inset-0 flex items-center justify-end bg-status-rose-background px-5"
        >
          <RiCloseLine className="size-6 text-status-rose-text" />
        </motion.div>
      </div>

      <motion.div
        className="relative flex w-full min-w-0 touch-pan-y"
        style={{ x, rotate }}
        /*
         * `dragDirectionLock` is the whole reason this can live in a scrolling
         * column. Without it a drag that starts 5° off vertical captures the
         * pointer and the page stops scrolling; with it, motion decides an axis
         * from the first few pixels and leaves the other one to the browser.
         * `touch-pan-y` tells the compositor the same thing.
         */
        drag={throwDir == null ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        dragMomentum={false}
        onDragEnd={(_event, info) => {
          const verdict = swipeVerdict(info.offset.x, info.velocity.x);
          if (!verdict) return;
          // Keep flying from the release point — do not wait on the parent.
          const dir: 1 | -1 = verdict === "saved" ? 1 : -1;
          setThrowDir(dir);
          void onCommit(verdict).then((ok) => {
            if (!ok) setThrowDir(null);
          });
        }}
        /*
         * The hint, and the exit. Both are the same property, so they are
         * expressed here rather than as classes — a card that is leaving is
         * thrown the way it was pushed.
         */
        /*
         * `false` on an ordinary mount, so the cards streamed into the page
         * are not animated twice — the `motion.li` above already stages their
         * arrival. Only an undo has somewhere to come back from.
         */
        initial={
          returningFrom && !reduceMotion ? { x: returningFrom * 440, opacity: 0 } : false
        }
        animate={
          throwDir != null
            ? { x: throwDir * 520, opacity: 0 }
            : hinting && !reduceMotion
              ? { x: [0, 52, -52, 0], opacity: 1 }
              : { x: 0, opacity: 1 }
        }
        transition={
          throwDir != null
            ? // Same curve as the exit variant so a late residual swap is seamless.
              { duration: 0.3, ease: [0.4, 0, 0.9, 0.5] }
            : hinting
              ? { duration: 1.9, times: [0, 0.28, 0.68, 1], ease: [0.4, 0, 0.2, 1] }
              : /*
                 * Softer than it was. At 520/42 the spring was effectively a cut
                 * — the card was back before the eye had followed it out, which
                 * is the "too snappy" the owner saw. This still settles without
                 * a wobble but the return is legible as a movement.
                 */
                {
                  type: "spring",
                  stiffness: 340,
                  damping: 32,
                  mass: 0.9,
                  // The fade trails the movement rather than matching it: a card
                  // that is fully opaque before it has stopped moving reads as a
                  // solid object arriving, where a simultaneous fade reads as a
                  // dissolve.
                  opacity: { duration: 0.18 },
                }
        }
        /*
         * Thrown, not faded. `custom` above says which way; the card leaves
         * past the edge of the column, taking its tilt with it, and only then
         * does the residual fade in underneath (`mode="wait"`).
         */
        variants={{
          exit: (direction: number) => ({
            x: direction * 520,
            opacity: 0,
            // Short, and accelerating. It starts from wherever the thumb was
            // — usually a third of the way out already — so a long duration
            // here reads as the card hesitating rather than being thrown.
            transition: { duration: 0.3, ease: [0.4, 0, 0.9, 0.5] },
          }),
        }}
        exit="exit"
      >
        <FeedCardView card={card} className="w-full" />
      </motion.div>
    </div>
  );
}

/* ==========================================================================
 * What is left behind
 * ========================================================================== */

function UndoResidual({ row, onUndo }: { row: Residual; onUndo: () => void }) {
  const saved = row.action === "saved";

  return (
    <motion.div
      /*
       * It grows into the hole the card left rather than appearing in it. The
       * card is 200-odd pixels tall and this row is 44; without the scale the
       * swap reads as a flicker, because two different things occupied the
       * same slot with no movement between them.
       */
      initial={{ opacity: 0, scaleY: 0.6 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.34, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cx(
        "flex w-full min-w-0 items-center gap-3 rounded-2xl border border-dashed px-4 py-3",
        "border-border-table bg-background-secondary-default",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-body-medium text-text-secondary">
        <span className="text-text-primary">{row.label}</span>{" "}
        {saved ? "saved" : "hidden from this list"}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className={cx(
          "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5",
          "border border-border-table bg-background-primary-default",
          "text-body-2-medium text-text-secondary transition-colors duration-150",
          "hover:bg-background-primary-hover hover:text-text-primary",
          "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <RiArrowGoBackLine aria-hidden className="size-3.5" />
        Undo
      </button>
    </motion.div>
  );
}
