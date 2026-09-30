import type { ReactNode } from 'react';
import { Card } from '../components/ui';

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

export function InstallHelpPage() {
  return (
    <div className="space-y-4">
      <Card title="📱 iPhone'a ekle">
        <Steps
          items={[
            <>Bu sayfayı <strong>Safari</strong>'de açın.</>,
            <>Alttaki <strong>Paylaş</strong> düğmesine (kare ve yukarı ok) dokunun.</>,
            <>Listeden <strong>Ana Ekrana Ekle</strong>'yi seçin, sonra <strong>Ekle</strong>'ye dokunun.</>,
            <>Artık ana ekrandaki <strong>oymfin</strong> simgesinden açın. İnternet olmadan da çalışır.</>,
          ]}
        />
        <p className="mt-3 rounded-xl bg-warn-soft p-2 text-xs text-warn">Safari sekmesinde girilen veriler ana ekran uygulamasına taşınmaz. Kullanmaya ana ekrandaki simgeden başlayın.</p>
      </Card>
      <Card title="💻 Mac'e ekle">
        <Steps
          items={[
            <>Sayfayı <strong>Safari</strong>'de açın (macOS Sonoma veya üstü).</>,
            <>Menüden <strong>Dosya → Dock'a Ekle</strong>'yi seçin.</>,
            <>Uygulama Dock'ta ayrı bir pencere olarak açılır. (Chrome/Edge'de adres çubuğundaki <strong>Yükle</strong> simgesi de olur.)</>,
          ]}
        />
      </Card>
      <Card title="☁️ iPhone ile Mac'i eşitleme (iCloud Drive)">
        <p className="mb-3 text-sm text-muted">
          Veriler her cihazda ayrı durur. Aynı Apple hesabındaki iCloud Drive üzerinden bir dosyayla taşınır; sunucu yoktur, verileriniz yalnızca sizin iCloud'unuzda kalır.
        </p>
        <h3 className="mb-2 text-sm font-semibold">Bir kereye mahsus</h3>
        <Steps
          items={[
            <>iPhone'da <strong>Dosyalar</strong> uygulaması → iCloud Drive → sağ üstteki <strong>⋯</strong> → <strong>Yeni Klasör</strong>: <code>oymfin</code>.</>,
            <>Mac'te Safari → <strong>Ayarlar → Genel → Dosya indirme konumu</strong> → <em>Diğer…</em> → iCloud Drive/<code>oymfin</code> (isteğe bağlı, kolaylık sağlar).</>,
          ]}
        />
        <h3 className="mt-4 mb-2 text-sm font-semibold">Her kullanımda</h3>
        <Steps
          items={[
            <><strong>Cihaza geçtiğinizde:</strong> Ayarlar → <strong>iCloud'dan eşitle</strong> → oymfin klasöründeki <strong>en yeni</strong> dosyayı seçin.</>,
            <><strong>İşiniz bitince:</strong> Ayarlar → <strong>iCloud'a kaydet</strong>. iPhone'da paylaşım menüsünden <strong>Dosyalara Kaydet</strong> → iCloud Drive → oymfin.</>,
            <>Kaydedilmemiş değişiklik varsa menüde turuncu nokta görünür.</>,
          ]}
        />
        <p className="mt-3 text-xs text-muted">
          Eşitleme verileri birleştirir, üzerine yazmaz: yanlışlıkla eski bir dosya seçseniz de yeni kayıtlarınız kaybolmaz. Aynı kaydı iki cihazda farklı düzenlediyseniz en son yapılan düzenleme geçerli olur. Eski dosyaları dilediğiniz zaman silebilirsiniz.
        </p>
      </Card>
      <Card title="🔒 Gizlilik">
        <p className="text-sm text-muted">
          Hesap, sunucu veya reklam yoktur. Tüm veriler cihazınızın tarayıcı deposunda tutulur. Uygulama internete yalnızca altın, döviz ve kripto fiyatlarını almak için bağlanır; bu isteklerde hiçbir kişisel bilgi gönderilmez.
        </p>
      </Card>
    </div>
  );
}
