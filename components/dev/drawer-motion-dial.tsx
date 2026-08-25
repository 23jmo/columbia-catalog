/**
 * The drawer no longer animates on open or close.
 *
 * `app/layout.tsx` still mounts this in development. Keep a no-op export so
 * that shared file does not need to change. Delete the mount there whenever
 * that file is next free to edit.
 */
export function DrawerMotionDial() {
  return null;
}
