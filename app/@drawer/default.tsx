/**
 * Default for the root `drawer` slot: nothing is open.
 *
 * Next.js requires a `default.tsx` for every parallel-route slot so that a
 * hard navigation to a route the slot does not match still renders. Returning
 * null is the correct "no course open" state.
 */
export default function DrawerDefault() {
  return null;
}
