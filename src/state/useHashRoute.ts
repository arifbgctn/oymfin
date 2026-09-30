import { useCallback, useSyncExternalStore } from 'react';

export type RouteName =
  | 'ozet'
  | 'islemler'
  | 'istatistik'
  | 'butce'
  | 'yatirim'
  | 'varlik'
  | 'hesaplar'
  | 'hesap'
  | 'duzenli'
  | 'diger'
  | 'ayarlar'
  | 'kategoriler'
  | 'kurulum';

export interface Route {
  name: RouteName;
  param?: string;
}

const SIMPLE: Record<string, RouteName> = {
  '': 'ozet',
  islemler: 'islemler',
  istatistik: 'istatistik',
  butce: 'butce',
  yatirim: 'yatirim',
  duzenli: 'duzenli',
  diger: 'diger',
  ayarlar: 'ayarlar',
  kategoriler: 'kategoriler',
  kurulum: 'kurulum',
  hesaplar: 'hesaplar',
};

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [first = '', second] = parts;
  if (first === 'yatirim' && second) return { name: 'varlik', param: decodeURIComponent(second) };
  if (first === 'hesaplar' && second) return { name: 'hesap', param: decodeURIComponent(second) };
  return { name: SIMPLE[first] ?? 'ozet' };
}

export function hrefFor(name: RouteName, param?: string): string {
  if (name === 'ozet') return '#/';
  if (name === 'varlik') return `#/yatirim/${encodeURIComponent(param ?? '')}`;
  if (name === 'hesap') return `#/hesaplar/${encodeURIComponent(param ?? '')}`;
  return `#/${name}`;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useHashRoute(): [Route, (name: RouteName, param?: string) => void] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const navigate = useCallback((name: RouteName, param?: string) => {
    window.location.hash = hrefFor(name, param);
    window.scrollTo?.({ top: 0 });
  }, []);
  return [parseHash(hash), navigate];
}
