"use client";

import { useCallback, useEffect, useState } from "react";
import roleApi, { type Role } from "@/services/role.service";

let cachedRoles: Role[] | null = null;
let pendingRoles: Promise<Role[]> | null = null;

const loadRoles = async (force = false) => {
  if (!force && cachedRoles) return cachedRoles;
  if (!force && pendingRoles) return pendingRoles;

  pendingRoles = roleApi
    .list()
    .then((roles) => {
      cachedRoles = roles;
      return roles;
    })
    .finally(() => {
      pendingRoles = null;
    });

  return pendingRoles;
};

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>(cachedRoles || []);
  const [loading, setLoading] = useState(!cachedRoles);
  const [error, setError] = useState<unknown>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const nextRoles = await loadRoles(true);
      setRoles(nextRoles);
      setError(null);
      return nextRoles;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchRoles = async () => {
      setLoading(!cachedRoles);
      try {
        const nextRoles = await loadRoles();
        if (!mounted) return;
        setRoles(nextRoles);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchRoles();

    return () => {
      mounted = false;
    };
  }, []);

  return { roles, loading, error, refetch };
}
