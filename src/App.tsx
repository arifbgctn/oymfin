import { useEffect, useState } from 'react';
import { AppShell } from './components/layout';
import { TransactionForm } from './components/TransactionForm';
import { Toasts } from './components/ui';
import { UpdatePrompt } from './components/UpdatePrompt';
import { bootstrap } from './db/bootstrap';
import { runRecurring } from './db/recurringRunner';
import { currentMonth } from './domain/month';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { AccountsPage } from './pages/AccountsPage';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { InstallHelpPage } from './pages/InstallHelpPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { MorePage } from './pages/MorePage';
import { RecurringPage } from './pages/RecurringPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AppProvider, useApp } from './state/AppContext';
import { useCurrency } from './state/currency';
import { useTheme } from './state/theme';
import { useHashRoute, type Route } from './state/useHashRoute';

const TITLES: Record<Route['name'], string> = {
  ozet: 'Özet',
  islemler: 'İşlemler',
  istatistik: 'İstatistik',
  butce: 'Bütçe',
  yatirim: 'Yatırımlar',
  varlik: 'Varlık',
  hesaplar: 'Hesaplar',
  hesap: 'Hesap',
  duzenli: 'Düzenli İşlemler',
  diger: 'Diğer',
  ayarlar: 'Ayarlar',
  kategoriler: 'Kategoriler',
  kurulum: 'Kurulum',
};

const WITH_MONTH = new Set<Route['name']>(['ozet', 'islemler', 'istatistik', 'butce']);
const BACK: Partial<Record<Route['name'], Route['name']>> = {
  varlik: 'yatirim',
  hesap: 'hesaplar',
  hesaplar: 'diger',
  duzenli: 'diger',
  kategoriler: 'diger',
  ayarlar: 'diger',
  kurulum: 'diger',
};

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'ozet':
      return <DashboardPage />;
    case 'islemler':
      return <TransactionsPage />;
    case 'istatistik':
      return <StatsPage />;
    case 'butce':
      return <BudgetsPage />;
    case 'yatirim':
      return <InvestmentsPage />;
    case 'varlik':
      return <AssetDetailPage id={route.param ?? ''} />;
    case 'hesaplar':
      return <AccountsPage />;
    case 'hesap':
      return <AccountDetailPage id={route.param ?? ''} />;
    case 'duzenli':
      return <RecurringPage />;
    case 'diger':
      return <MorePage />;
    case 'ayarlar':
      return <SettingsPage />;
    case 'kategoriler':
      return <CategoriesPage />;
    case 'kurulum':
      return <InstallHelpPage />;
  }
}

function Shell() {
  const [route] = useHashRoute();
  const { txForm } = useApp();
  const [currency] = useCurrency();
  useTheme();
  return (
    <>
      {/* Para birimi değişince tutarlar yeni simgeyle yeniden çizilsin. */}
      <AppShell key={currency} route={route.name} title={TITLES[route.name]} showMonth={WITH_MONTH.has(route.name)} back={BACK[route.name]}>
        <Page route={route} />
      </AppShell>
      {txForm.open && <TransactionForm />}
      <UpdatePrompt />
      <Toasts />
    </>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // Uygulama açık kalırken ay değişirse düzenli işlemleri üret.
    const onVisible = () => document.visibilityState === 'visible' && void runRecurring(currentMonth());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="font-semibold">Veritabanı açılamadı</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <p className="mt-2 text-sm text-muted">Özel (gizli) tarama modunda depolama kapalı olabilir.</p>
      </div>
    );
  }
  if (!ready) return <div className="flex min-h-dvh items-center justify-center text-muted" aria-busy="true">Yükleniyor…</div>;
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
