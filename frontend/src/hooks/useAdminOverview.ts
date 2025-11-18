import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";

import { AdminOverview, fetchAdminOverview } from "../api";

interface UseAdminOverviewResult {
  overview: AdminOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setOverview: Dispatch<SetStateAction<AdminOverview | null>>;
}

export function useAdminOverview(): UseAdminOverviewResult {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { overview, loading, error, refresh, setOverview };
}
