import { CalendarClock, ChevronRight, Settings, Smartphone, Tags, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Card } from '../components/ui';
import { useMeta } from '../hooks/data';
import { hrefFor, type RouteName } from '../state/useHashRoute';

function Row({ to, icon, title, desc, extra }: { to: RouteName; icon: ReactNode; title: string; desc: string; extra?: ReactNode }) {
  return (
    <li>
      <a href={hrefFor(to)} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-accent">{icon}</span>
        <span className="flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block text-xs text-muted">{desc}</span>
        </span>
        {extra}
        <ChevronRight size={18} className="text-muted" />
      </a>
    </li>
  );
}

export function MorePage() {
  const dirty = useMeta<number>('dirtySince');
  return (
    <Card className="p-2!">
      <ul>
        <Row to="hesaplar" icon={<Wallet size={20} />} title="Hesaplar" desc="Banka kartı, kredi kartı, nakit bakiyeleri" />
        <Row to="duzenli" icon={<CalendarClock size={20} />} title="Düzenli İşlemler" desc="Kira, maaş, abonelikler" />
        <Row to="kategoriler" icon={<Tags size={20} />} title="Kategoriler" desc="Ekle, düzenle, arşivle" />
        <Row to="ayarlar" icon={<Settings size={20} />} title="Ayarlar & Eşitleme" desc="iCloud eşitleme, tema, yedek" extra={dirty !== undefined ? <Badge tone="warn">Kaydet</Badge> : undefined} />
        <Row to="kurulum" icon={<Smartphone size={20} />} title="Kurulum" desc="iPhone ve Mac'e ekleme, iCloud ayarı" />
      </ul>
    </Card>
  );
}
