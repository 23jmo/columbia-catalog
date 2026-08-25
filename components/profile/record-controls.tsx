"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RiDeleteBin6Line, RiDownload2Line, RiRefreshLine } from "@remixicon/react";

import { deleteRecordAction } from "@/app/profile/actions";
import { Button } from "@/components/base/buttons/button";
import { restartOnboarding } from "@/lib/onboarding/store";
import type { StudentProfile } from "@/lib/profile/types";
import { ProfileModal } from "./profile-modal";

/**
 * Export, erasure, and a way back through setup.
 *
 * Export and erasure are the two controls `vergil_api_spec.md` §15 names as
 * required practice for stored personal data. Redo is the third: the wizard
 * is reachable from a URL, but a signed-in student who wants to walk it
 * again should not have to remember that.
 *
 * They are on the page rather than buried in a settings screen because a
 * student should never have to email anyone to get their own coursework out of
 * our database, and because a product that holds self-reported academic data
 * ought to make leaving as easy as arriving.
 *
 * ── Export is a client-side download, not an endpoint ───────────────────────
 *
 * The whole record is already in this component's props — it was rendered from
 * it. Serialising it here and handing over a Blob means the export never
 * becomes a URL that could be fetched by anything other than the person looking
 * at the page.
 *
 * ── Erasure is the one destructive action here, so it confirms ──────────────
 *
 * Unlike removing a single course, this cannot be undone by retyping one line:
 * a re-import means finding the transcript again and re-confirming every row.
 * That asymmetry is what earns the dialog.
 */

export interface RecordControlsProps {
  profile: StudentProfile;
  /** False when nobody is signed in — there is no stored record to erase. */
  signedIn?: boolean;
}

export function RecordControls({ profile, signedIn = true }: RecordControlsProps) {
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Wipe the local wizard so it opens on question one, then go there.
   *
   * Completing it again upserts into the existing record — school and
   * year update, programs and courses union. It does not erase. That is
   * the button next to this one.
   */
  const redoOnboarding = () => {
    restartOnboarding();
    router.push("/onboarding");
  };

  const exportRecord = () => {
    /*
     * Deliberately not `JSON.stringify(profile)`: that would put the display
     * name and email into a file the student might forward. The export is the
     * academic record — the part they cannot reconstruct — and nothing else.
     */
    const payload = {
      exportedAt: new Date().toISOString(),
      note: "Self-reported academic record from LionPlan. Not a registrar document.",
      school: profile.school,
      classYear: profile.classYear,
      programIds: profile.programIds,
      attestations: profile.attestations,
      courses: profile.courses,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lionplan-record.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const erase = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteRecordAction();
      if (!result.ok) {
        setError(result.error ?? "Could not erase the record.");
        return;
      }
      setIsConfirmOpen(false);
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="small"
          variant="secondary"
          leadingIcon={RiRefreshLine}
          onClick={redoOnboarding}
          disabled={!signedIn}
          title="Walk through setup again. Existing courses stay; new answers are added."
        >
          Redo onboarding
        </Button>
        <Button
          size="small"
          variant="secondary"
          leadingIcon={RiDownload2Line}
          onClick={exportRecord}
          disabled={!signedIn || profile.courses.length === 0}
          title={signedIn ? undefined : "Nothing is stored until you sign in."}
        >
          Export my record
        </Button>
        <Button
          size="small"
          variant="danger"
          leadingIcon={RiDeleteBin6Line}
          onClick={() => setIsConfirmOpen(true)}
          disabled={!signedIn || profile.courses.length === 0}
          title={signedIn ? undefined : "Nothing is stored until you sign in."}
        >
          Erase my record
        </Button>
      </div>

      <ProfileModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Erase your academic record?"
        description="This deletes every course you have entered, your declared programs and every requirement you certified. Your account and your saved schedules are untouched."
        footer={
          <>
            <Button size="small" variant="secondary" onClick={() => setIsConfirmOpen(false)}>
              Keep it
            </Button>
            <Button size="small" variant="danger" disabled={isPending} onClick={erase}>
              {isPending ? "Erasing…" : "Erase everything"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body-regular text-pretty text-text-secondary">
            There is no undo. Export first if you want a copy — the button is right beside this
            one and the file downloads straight to your device.
          </p>
          <p className="text-caption-1-regular text-pretty text-text-tertiary">
            {profile.courses.length} course{profile.courses.length === 1 ? "" : "s"} and{" "}
            {Object.keys(profile.attestations).length} self-certified requirement
            {Object.keys(profile.attestations).length === 1 ? "" : "s"} will be deleted.
          </p>
          {error ? (
            <p className="text-caption-1-regular text-text-error-primary" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </ProfileModal>
    </>
  );
}
