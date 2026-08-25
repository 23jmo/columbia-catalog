import type { Metadata } from "next";

import {
  CourseworkCard,
  DataCard,
  OutstandingCard,
  ProfileHero,
  ProgramAuditCard,
  RecommendedCourses,
  SignInNotice,
} from "@/components/profile";
import { AppShell } from "@/components/shell/app-shell";
import { pageIdentityContentClass } from "@/components/shell/page-hero-layout";
import { PageContent } from "@/components/shell/page-content";
import { loadProfilePageData } from "@/lib/profile/page-data";
import { EMPTY_PROFILE } from "@/lib/profile/types";

/**
 * The profile screen — spec §22's open question 4, answered as far as public
 * data allows.
 *
 * One centred column of stacked cards, ordered by what the reader came for:
 *
 *   1. **Who am I and how far along am I.** The identity hero, whose headline
 *      figure is degree progress.
 *   2. **What do I still have to do**, ordered by how actionable it is.
 *   3. **What should I take next term** to move it.
 *   4. **The full audit**, program by program, done and not done together.
 *   5. **What I have taken**, which is the input to all of the above.
 *   6. **What this actually is**, and how to export or erase it.
 *
 * That order puts the answer before the evidence. A student opening this page
 * has one question — "am I on track" — and the cards below the fold exist to
 * let them check the answer rather than to make them assemble it.
 *
 * ── Signed out is a first-class state, not a redirect ───────────────────────
 *
 * Spec §15: reads are free, writes need an account. There is nothing to read
 * here without an account, but the honest response to that is a page that
 * explains what signing in would give them — not a bounce to an auth wall on a
 * product whose whole premise is that browsing costs nothing.
 *
 * It is a first-class state, though, not the signed-in page with the data
 * removed. Rendering the full stack for a visitor with no record produced four
 * cards of empty scaffolding — a statistics strip reading "0 / 0 / 0 of 0 / 0",
 * a recommendations card titled "0 courses", a coursework card with two inert
 * buttons — each with a sentence underneath explaining why it was empty. Five
 * separate surfaces made the same offer ("sign in and declare a degree"), which
 * is how a page ends up more apology than product.
 *
 * So the signed-out route is three things: who you would be, the one control
 * that gets you there, and what we would hold. Everything below needs a record
 * to be about, and appears when there is one.
 *
 * ── Never statically rendered ──────────────────────────────────────────────
 *
 * `force-dynamic`. Every byte on this page is one student's own record, and a
 * profile served from a shared cache would be the single worst bug this app
 * could ship.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your profile — Columbia Catalog",
  description:
    "Your major, the courses you have taken, which requirements are filled and which are left, and what to take next term. Self-reported — never a registrar record.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const data = await loadProfilePageData();
  const profile = data.profile ?? { ...EMPTY_PROFILE, userId: "" };
  const signedIn = data.profile != null;

  return (
    <AppShell activeNav="profile">
      <PageContent className={pageIdentityContentClass()}>
        <ProfileHero
          profile={profile}
          audit={data.audit}
          progress={data.progress}
          programOptions={data.programOptions}
          signedIn={signedIn}
        />

        {!signedIn ? <SignInNotice /> : null}

        {signedIn ? (
          <>
            <OutstandingCard remaining={data.audit.remaining} />

            <RecommendedCourses
              recommendations={data.recommendations}
              termLabel={data.recommendTermLabel}
              hasPrograms={data.audit.programs.length > 0}
            />

            {data.audit.programs.map((result) => (
              <ProgramAuditCard key={result.program.id} result={result} />
            ))}

            <CourseworkCard
              courses={profile.courses}
              titles={data.titles}
              suggestions={data.suggestions}
              unmatchedCourseIds={data.audit.unmatchedCourseIds}
              crossCounted={data.audit.crossCounted}
              signedIn={signedIn}
            />
          </>
        ) : null}

        {/*
          Stays on both. What we would hold is most worth reading BEFORE you
          hand it over, not after — this is the one piece of the page a
          signed-out visitor has a real reason to want.
        */}
        <DataCard profile={profile} signedIn={signedIn} />
      </PageContent>
    </AppShell>
  );
}
