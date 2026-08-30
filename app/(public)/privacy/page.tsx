import type { Metadata } from "next";
import Link from "next/link";

import { PublicSection } from "@/components/marketing/public-doc";

export const metadata: Metadata = {
  title: "Privacy · LionPlan",
  description:
    "How LionPlan handles the academic record you give it. Transcript files stay in your browser. We do not sell student data.",
};

/**
 * Product privacy page. Must render for logged-out visitors: the guest
 * gate used to 307 this URL to onboarding, which is how a privacy policy
 * becomes unreachable to the people who need it.
 *
 * Transcript images carry a name, a student id, grades, and a GPA. The
 * importer reads them in the browser on purpose. This page has to say
 * that, and it has to say we do not sell the record that follows.
 */
export default function PrivacyPage() {
  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-text-primary">
          Privacy
        </h1>
        <p className="text-body-regular text-text-tertiary">
          Last updated August 30, 2026
        </p>
      </header>

      <PublicSection title="The short version">
        <p>
          Your transcript file stays on your device. The academic record you
          confirm is private to your account. We do not sell it. We do not
          use it for advertising.
        </p>
      </PublicSection>

      <PublicSection title="Before you sign in">
        <p>
          Setup answers live in your browser until you sign in. If you
          leave without creating an account, that draft stays on the device
          you used. It is not sent to us as a saved plan.
        </p>
      </PublicSection>

      <PublicSection title="Transcript files">
        <p>
          If you import a transcript, the file is read in your browser. The
          image or PDF is not uploaded. It is not stored on our servers. We
          do not send the page to a vision model. Only the course codes you
          review and confirm can be saved to your account after you sign in.
        </p>
      </PublicSection>

      <PublicSection title="After you sign in">
        <p>
          Sign-in is Google, with a Columbia or Barnard account. We keep the
          name and email Google sends so the account works. We also keep the
          record you gave us: school, class year, major, courses, likes,
          interests, and any plans you save.
        </p>
        <p>
          That record is yours. Other students cannot read it. We do not
          sell it, rent it, or hand it to advertisers.
        </p>
      </PublicSection>

      <PublicSection title="What we never do">
        <p>
          We never store a Vergil or SSOL login token. We never register,
          drop, or waitlist you at Columbia. We do not take writes against
          columbia.edu hosts.
        </p>
      </PublicSection>

      <PublicSection title="Your controls">
        <p>
          After you sign in, you can export or erase your academic record
          from your profile. You can delete the whole account from settings.
          Deleting the account removes the stored record.
        </p>
      </PublicSection>

      <PublicSection title="Cookies">
        <p>
          We use a session cookie so you stay signed in, and a small cookie
          that remembers whether you finished setup. That is so we do not
          send you through the wizard again on every visit.
        </p>
      </PublicSection>

      <PublicSection title="Browser extension">
        <p>
          The optional schedule-refresh extension has its own policy at{" "}
          <Link
            href="/privacy/extension"
            className="text-text-primary underline decoration-border-table underline-offset-2 hover:decoration-text-tertiary"
          >
            /privacy/extension
          </Link>
          . It reads public meeting times from Vergil search. It does not
          read your transcript or your LionPlan plan.
        </p>
      </PublicSection>
    </>
  );
}
