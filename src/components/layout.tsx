import { ArrowLeft, BarChart3, CalendarClock, Home, LayoutGrid, List, PiggyBank, Plus, Settings, Smartphone, Tags, TrendingUp, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMeta } from '../hooks/data';
import { useApp } from '../state/AppContext';
import { hrefFor, type RouteName } from '../state/useHashRoute';
import { MonthPicker } from './MonthPicker';
import { IconButton } from './ui';

interface NavItem {
  name: RouteName;
  label: string;
  icon: ReactNode;
}

const MOBILE_NAV: NavItem[] = [
  { name: 'ozet', label: 'Özet', icon: <Home size={22} /> },
  { name: 'islemler', label: 'İşlemler', icon: <List size={22} /> },
  { name: 'istatistik', label: 'İstatistik', icon: <BarChart3 size={22} /> },
  { name: 'butce', label: 'Bütçe', icon: <PiggyBank size={22} /> },
  { name: 'yatirim', label: 'Yatırım', icon: <TrendingUp size={22} /> },
];

const SIDEBAR_NAV: NavItem[] = [
  ...MOBILE_NAV,
  { name: 'hesaplar', label: 'Hesaplar', icon: <Wallet size={20} /> },
  { name: 'duzenli', label: 'Düzenli İşlemler', icon: <CalendarClock size={20} /> },
  { name: 'kategoriler', label: 'Kategoriler', icon: <Tags size={20} /> },
  { name: 'ayarlar', label: 'Ayarlar & Eşitleme', icon: <Settings size={20} /> },
  { name: 'kurulum', label: 'Kurulum', icon: <Smartphone size={20} /> },
];

const MORE_GROUP: RouteName[] = ['diger', 'hesaplar', 'hesap', 'duzenli', 'kategoriler', 'ayarlar', 'kurulum'];

function isActive(item: RouteName, current: RouteName): boolean {
  if (item === current) return true;
  return (item === 'yatirim' && current === 'varlik') || (item === 'hesaplar' && current === 'hesap');
}

function DirtyDot() {
  const dirty = useMeta<number>('dirtySince');
  if (dirty === undefined) return null;
  return <span className="absolute top-0.5 right-1/2 size-2 translate-x-3 rounded-full bg-warn" aria-hidden title="Eşitlenmemiş değişiklik var" />;
}

export function AppShell({ route, title, showMonth, back, children }: { route: RouteName; title: string; showMonth?: boolean; back?: RouteName; children: ReactNode }) {
  const { openTxForm } = useApp();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="pt-safe sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2 text-xl font-extrabold tracking-tight">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-8" />
          oymfin
        </div>
        <button
          type="button"
          onClick={() => openTxForm()}
          className="mb-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-fg hover:opacity-90"
        >
          <Plus size={20} /> İşlem ekle
        </button>
        <nav aria-label="Ana menü" className="flex flex-col gap-1">
          {SIDEBAR_NAV.map((item) => (
            <a
              key={item.name}
              href={hrefFor(item.name)}
              aria-current={isActive(item.name, route) ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium ${
                isActive(item.name, route) ? 'bg-accent-soft text-text' : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {item.icon}
              {item.label}
              {item.name === 'ayarlar' && <DirtyDot />}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="pt-safe px-safe sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-2 px-3">
            <div className="flex min-w-0 items-center gap-1">
              {!back && (
                <a
                  href={hrefFor('diger')}
                  aria-label="Menü"
                  aria-current={MORE_GROUP.includes(route) ? 'page' : undefined}
                  className="relative -ml-2 inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 md:hidden"
                >
                  <LayoutGrid size={22} />
                  <DirtyDot />
                </a>
              )}
              {back && (
                <a href={hrefFor(back)} aria-label="Geri" className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2">
                  <ArrowLeft size={22} />
                </a>
              )}
              <h1 className={`truncate text-xl font-bold ${showMonth ? 'sr-only md:not-sr-only' : ''}`}>{title}</h1>
            </div>
            {showMonth && <MonthPicker />}
          </div>
        </header>
        <main className="px-gutter mx-auto max-w-5xl pt-4 pb-32 md:pb-10">{children}</main>
      </div>

      {showMonth && (
        <IconButton
          label="İşlem ekle"
          onClick={() => openTxForm()}
          className="fab-safe fixed right-4 z-40 size-14! bg-accent text-accent-fg! shadow-xl hover:bg-accent! md:hidden"
        >
          <Plus size={28} />
        </IconButton>
      )}

      <nav aria-label="Alt menü" className="pb-safe px-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg">
          {MOBILE_NAV.map((item) => {
            const active = isActive(item.name, route);
            return (
              <a
                key={item.name}
                href={hrefFor(item.name)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? 'text-accent' : 'text-muted'}`}
              >
                {item.icon}
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
