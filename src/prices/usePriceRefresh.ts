import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Asset } from '../domain/types';
import { refreshPrices, type RefreshStatus } from './priceService';

/** Otomatik fiyatlı varlıklar için sayfa açılınca (15 dk'dan eskiyse) ve istenince fiyat yeniler. */
export function usePriceRefresh(assets: Asset[] | undefined) {
  const symbols = useMemo(
    () => [...new Set((assets ?? []).filter((a) => a.priceSource === 'auto' && !a.archived).map((a) => a.symbol))].sort(),
    [assets],
  );
  const key = symbols.join(',');
  const [status, setStatus] = useState<RefreshStatus | 'loading'>('idle');
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const refresh = useCallback(
    async (force: boolean) => {
      if (!key) return setStatus('idle');
      setStatus('loading');
      const s = await refreshPrices(key.split(','), { force });
      if (alive.current) setStatus(s);
    },
    [key],
  );

  const loaded = assets !== undefined;
  useEffect(() => {
    if (loaded) void refresh(false);
  }, [refresh, loaded]);

  return { status, refresh: () => refresh(true), hasAuto: symbols.length > 0 };
}
