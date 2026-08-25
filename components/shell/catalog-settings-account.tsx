"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RiDeleteBin6Line, RiLoginBoxLine } from "@remixicon/react";

import { deleteAccountAction } from "@/app/settings/actions";
import { SETTINGS_CARD_MOBILE } from "@/components/shell/catalog-settings-layout";
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionLabel,
  SettingsValueField,
} from "@/components/application/settings/settings-rows";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { SocialButton } from "@/components/base/social-button/social-button";
import { ProfileModal } from "@/components/profile/profile-modal";
import { useSessionAccount } from "@/hooks/use-session-account";
import { isConfigured } from "@/lib/db/client";
import { signIn, signOut } from "@/lib/db/auth";

export interface CatalogSettingsAccountProps {
  onClose?: () => void;
}

export function CatalogSettingsAccount({ onClose }: CatalogSettingsAccountProps) {
  const router = useRouter();
  const { account, isLoading } = useSessionAccount();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initials = account
    ? account.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    : null;

  const startSignIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    const { error } = await signIn();
    setSigningIn(false);
    if (error) setSignInError(error);
  };

  const endSession = async () => {
    setSignOutError(null);
    try {
      await signOut();
      onClose?.();
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Try again.");
    }
  };

  const deleteAccount = () => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteAccountAction();
      if (!result.ok) {
        setDeleteError(result.error ?? "Could not delete your account.");
        return;
      }

      await signOut();
      setIsDeleteOpen(false);
      onClose?.();
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <SettingsCard className={SETTINGS_CARD_MOBILE}>
        {isLoading ? (
          <SettingsRow label="Account" description="Checking your session…" />
        ) : account ? (
          <>
            <SettingsRow label="Signed in as">
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                <Avatar size="sm" src={account.avatarUrl} initials={initials ?? undefined} alt={account.name} />
                <SettingsValueField className="w-full min-w-0 max-w-full sm:w-auto sm:max-w-[220px]">
                  {account.email}
                </SettingsValueField>
              </div>
            </SettingsRow>
            <SettingsRow label="Name">
              <SettingsValueField className="w-full max-w-full sm:w-[202px]">{account.name}</SettingsValueField>
            </SettingsRow>
          </>
        ) : (
          <>
            <SettingsRow
              label="Not signed in"
              description="Browse for free. Sign in with Columbia Google when you want to save."
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-background-tertiary-default">
                <RiLoginBoxLine className="size-4 text-foreground-icon-secondary" aria-hidden />
              </span>
            </SettingsRow>
            {isConfigured() ? (
              <SettingsRow label="Sign in">
                <SocialButton
                  className="w-full shrink-0 sm:w-auto"
                  brand="google"
                  onClick={() => void startSignIn()}
                  disabled={signingIn}
                >
                  Continue with Google
                </SocialButton>
              </SettingsRow>
            ) : (
              <SettingsRow label="Sign in" description="Accounts are not configured on this deployment." />
            )}
            {signInError ? (
              <p className="px-3 pb-3 text-caption-1-regular text-text-error-primary">{signInError}</p>
            ) : null}
          </>
        )}
      </SettingsCard>

      {account ? (
        <>
          <div className="flex w-full flex-col gap-2">
            <SettingsSectionLabel>Session</SettingsSectionLabel>
            <SettingsCard className={SETTINGS_CARD_MOBILE}>
              <SettingsRow
                label="Sign out"
                description="Your saved courses and plans stay on this account until you delete it."
              >
                <Button
                  className="shrink-0"
                  variant="secondary"
                  size="small"
                  onClick={() => void endSession()}
                >
                  Sign out
                </Button>
              </SettingsRow>
              {signOutError ? (
                <p className="px-3 pb-3 text-caption-1-regular text-text-error-primary">{signOutError}</p>
              ) : null}
            </SettingsCard>
          </div>

          <div className="flex w-full flex-col gap-2">
            <SettingsSectionLabel>Danger zone</SettingsSectionLabel>
            <SettingsCard className={SETTINGS_CARD_MOBILE}>
              <SettingsRow
                label="Delete account"
                description="Permanently removes your account, schedules, bookmarks, coursework, and agent history."
              >
                {/*
                  `shrink-0` is load-bearing. `SettingsRow` lays the label and
                  the control out as `flex justify-between`, and `Button` is
                  `whitespace-nowrap overflow-hidden` with no shrink of its
                  own — so the longest description on this page squeezed the
                  button and cut 19px off "Delete account" rather than wrapping
                  it. Every control in a settings row wants this.
                */}
                <Button
                  className="shrink-0"
                  variant="danger"
                  size="small"
                  leadingIcon={RiDeleteBin6Line}
                  onClick={() => {
                    setDeleteError(null);
                    setIsDeleteOpen(true);
                  }}
                >
                  Delete account
                </Button>
              </SettingsRow>
            </SettingsCard>
          </div>
        </>
      ) : null}

      <SettingsCard className={SETTINGS_CARD_MOBILE}>
        <SettingsRow
          label="Columbia Google only"
          description="We restrict sign-in to @columbia.edu and @barnard.edu addresses."
        />
        <SettingsRow
          label="What saving unlocks"
          description="Bookmarks, schedule plans, onboarding migration, and seat alerts."
        />
      </SettingsCard>

      {/*
        `layer="above-surface"` because this dialog is launched from inside the
        settings modal, which portals to <body> at z-100. At the default z-50
        the confirmation opened and took focus behind the settings scrim, so
        the button appeared to do nothing.
      */}
      <ProfileModal
        layer="above-surface"
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete your account?"
        description="This cannot be undone."
        footer={
          <>
            <Button size="small" variant="secondary" onClick={() => setIsDeleteOpen(false)}>
              Keep account
            </Button>
            <Button size="small" variant="danger" disabled={isPending} onClick={deleteAccount}>
              {isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body-regular text-pretty text-text-secondary">
            Your LionPlan account and everything saved to it will be erased — schedule
            plans, bookmarks, seat watches, self-reported coursework, and assistant conversations.
          </p>
          <p className="text-caption-1-regular text-pretty text-text-tertiary">
            Signed in as {account?.email}. You can sign out instead if you only want to switch
            accounts on this device.
          </p>
          {deleteError ? (
            <p className="text-caption-1-regular text-text-error-primary" role="alert">
              {deleteError}
            </p>
          ) : null}
        </div>
      </ProfileModal>
    </div>
  );
}
