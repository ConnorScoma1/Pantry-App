import type { HouseholdInvite, HouseholdMember, HouseholdSummary, Result } from "@kitchen-pantry/database";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useApp } from "./app-state";

/** Same behaviour as the web hook: members, invites and the owner's tools. */
export function useHousehold() {
  const { mode, households: repo, refreshProfile } = useApp();
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
    if (m.ok && m.data.some((x) => x.isYou && x.role === "owner")) {
      const i = await repo.invites();
      if (i.ok) setInvites(i.data);
    } else setInvites([]);
    setLoading(false);
  }, [repo]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const act = useCallback(
    async <T,>(fn: () => Promise<Result<T>>, membership = false): Promise<Result<T>> => {
      const r = await fn();
      if (r.ok) {
        await reload();
        if (membership) await refreshProfile(); // the active household (and its allergy list) may have changed
      }
      return r;
    },
    [reload, refreshProfile],
  );

  const you = members.find((m) => m.isYou) ?? null;
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.displayName])), [members]);

  return {
    mode,
    loading,
    error,
    members,
    households,
    invites,
    you,
    names,
    active: households.find((h) => h.isActive) ?? null,
    isOwner: you?.role === "owner",
    seatsLeft: Math.max(0, 6 - members.length - invites.filter((i) => i.status === "pending").length),
    reload,
    createInvite: (email: string | null) => act(() => repo.createInvite({ email: email ?? "" })),
    revokeInvite: (id: string) => act(() => repo.revokeInvite(id)),
    inviteDetails: (tokenOrLink: string) => repo.inviteDetails(tokenOrLink),
    acceptInvite: (tokenOrLink: string) => act(() => repo.acceptInvite(tokenOrLink), true),
    removeMember: (userId: string) => act(() => repo.removeMember(userId), true),
    leave: () => act(() => repo.leave(), true),
    transferOwnership: (userId: string) => act(() => repo.transferOwnership(userId)),
    switchHousehold: (id: string) => act(() => repo.switchHousehold(id), true),
    setDisplayName: (name: string) => act(() => repo.setDisplayName(name)),
    rename: (name: string) => act(() => repo.rename(households.find((h) => h.isActive)?.id ?? "", name)),
  };
}
