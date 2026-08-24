/**
 * The route-level skeleton.
 *
 * Deliberately shaped like the real screen — the ornament, one headline, a
 * ragged row of pills — rather than a spinner, so the first frame a new student
 * sees is the layout they are about to get rather than a blank page with a
 * wheel on it. It paints the same neutral ground the flow does, because that
 * ground now comes from the flow rather than from `AppShell`, and a skeleton on
 * white followed by content on neutral is a visible flash.
 *
 * Every block paints a real token; a skeleton in a token that does not resolve
 * renders transparent, which is precisely the bug `lib/design-tokens.test.ts`
 * exists to catch.
 */
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background-secondary-default">
      <div
        className="mx-auto flex w-full max-w-[620px] flex-col items-center px-5 pt-[13vh] pb-24 sm:pt-[15vh]"
        aria-hidden
      >
        <div className="size-[85px] rounded-full bg-background-tertiary-default" />
        <div className="mt-7 h-10 w-4/5 rounded-lg bg-background-tertiary-default sm:mt-9" />
        <div className="mt-8 flex flex-wrap justify-center gap-2 sm:mt-10">
          {[128, 96, 152, 112, 80].map((width) => (
            <div
              key={width}
              className="h-10 rounded-full bg-background-tertiary-default"
              style={{ width }}
            />
          ))}
        </div>
        <div className="mt-10 size-14 rounded-full border-2 border-border-button-default sm:mt-12" />
      </div>
      <p className="sr-only">Loading onboarding</p>
    </div>
  );
}
