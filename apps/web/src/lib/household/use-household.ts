"use client";

import {
  createPreviewHouseholdRepository,
  type HouseholdInvite,
  type HouseholdMember,
  type HouseholdRepository,
  type HouseholdSummary,
  type Result,
} from "@kitchen-pantry/database";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createInviteAction,
  householdsAction,
  invitesAction,
  leaveHouseholdAction,
  membersAction,
  removeMemberAction,
  renameHouseholdAction,
  revokeInviteAction,
  setDisplayNameAction,
  switchHouseholdAction,
  transferOwnershipAction,
  acceptInviteAction,
  inviteDetailsAction,
} from "@/app/(app)/household/actions";
import { useProfile } from "@/components/profile/profile-provider";

const supabaseHouseholds: HouseholdRepository = {
  members: () => membersAction(),
  households: () => householdsAction(),
  invites: () => invitesAction(),
  createInvite: (i) => createInviteAction(i),
  revokeInvite: (id) => revokeInviteAction(id),
  inviteDetails: (t) => inviteDetailsAction(t),
  acceptInvite: (t) => acceptInviteAction(t),
  removeMember: (id) => removeMemberAction(id),
  leave: () => leaveHouseholdAction(),
  transferOwnership: (id) => transferOwnershipAction(id),
  switchHousehold: (id) => switchHouseholdAction(id),
  setDisplayName: (n) => setDisplayNameAction(n),
  rename: (id, n) => renameHouseholdAction(id, n),
};
const previewHouseholds = createPreviewHouseholdRepository();

/** Who's in the household, and the owner's tools to manage it. */
export function useHousehold() {
  const { mode } = useProfile();
  const router = useRouter();
  const repo = mode === "preview" ? previewHouseholds : supabaseHouseholds;
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [m, h] = await Promise.all([repo.members(), repo.households()]);
    if (m.ok) setMembers(m.data);
    if (h.ok) setHouseholds(h.data);
    setError(!m.ok ? m.message : !h.ok ? h.message : null);
    const owner = m.ok && m.data.some((x) => x.isYou && x.role === "owner");
    if (owner) {
      const i = await repo.invites();
      if (i.ok) setInvites(i.data);
    } else setInvites([]);
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const you = members.find((m) => m.isYou) ?? null;
  const active = households.find((h) => h.isActive) ?? null;
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.displayName])), [members]);

  /** Run a change, then refresh this hook and (for membership) the whole page. */
  const act = useCallback(
    async <T,>(fn: () => Promise<Result<T>>, refreshPage = false): Promise<Result<T>> => {
      const result = await fn();
      if (result.ok) {
        await reload();
        if (refreshPage) router.refresh();
      }
      return result;
    },
    [reload, router],
  );

  return {
    mode,
    loading,
    error,
    members,
    households,
    invites,
    you,
    active,
    names,
    isOwner: you?.role === "owner",
    seatsLeft: Math.max(0, 6 - members.length - invites.filter((i) => i.status === "pending").length),
    reload,
    createInvite: (email: string | null) => act(() => repo.createInvite({ email: email ?? "" })),
    revokeInvite: (id: string) => act(() => repo.revokeInvite(id)),
    removeMember: (userId: string) => act(() => repo.removeMember(userId), true),
    leave: () => act(() => repo.leave(), true),
    transferOwnership: (userId: string) => act(() => repo.transferOwnership(userId)),
    switchHousehold: (id: string) => act(() => repo.switchHousehold(id), true),
    setDisplayName: (name: string) => act(() => repo.setDisplayName(name)),
    rename: (name: string) => act(() => repo.rename(active?.id ?? "", name)),
  };
}
