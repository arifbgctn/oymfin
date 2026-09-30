# oymfin

Aylık gelir, gider ve yatırım takibi. iPhone'a, Mac'e ve bilgisayara uygulama gibi kurulur, internetsiz çalışır.

**Gizlilik:** Hesap yok, sunucu yok. Tüm veriler cihazın kendisinde (tarayıcının IndexedDB deposunda) tutulur. Uygulama internete yalnızca altın, döviz ve kripto fiyatlarını almak için bağlanır; bu isteklerde kişisel veri gönderilmez.

## Özellikler

- Gelir/gider ekleme, düzenleme, silme; Türkçe tutar girişi (`1.234,56`)
- Ay seçici; aylık özet kartları (gelir, gider, net, tasarruf oranı, geçen aya göre değişim)
- Kategoriye göre gider grafiği, son 6 ayın gelir/gider grafiği
- İstatistikler (son 3/6/12 ay): ortalama gelir/gider/tasarruf, aylık net çizgisi, en çok/az harcanan ay, bu ay ile geçen ayın günlük harcama hızı, kategorilerin aylık eğilimi ve ortalamaya göre değişimi, tablo görünümü
- Hesaplar: banka kartı, kredi kartı (borç + limit), nakit; işlemde "nereden ödendi" seçimi, bakiyeler otomatik güncellenir; hesaplar arası aktarım / kart borcu ödeme (gelir-gider sayılmaz)
- Kategoriler (renk + simge; ekle, düzenle, arşivle)
- Kategori bütçeleri: sonraki aylara taşınır; %80'de uyarı, %100'ü geçince "aşıldı"
- Düzenli işlemler (kira, maaş, abonelik): her ay otomatik eklenir, 31'i kısa aylarda ayın son günü olur
- Yatırımlar: altın, gümüş, döviz, kripto (canlı fiyat) ve hisse, fon, mevduat (elle fiyat); alım/satım geçmişi, ağırlıklı ortalama maliyet, kâr/zarar, gerçekleşen kâr/zarar, toplam servet
- iPhone ↔ Mac eşitleme: iCloud Drive'daki bir dosya üzerinden, verileri birleştirerek
- Açık/koyu tema, çevrimdışı çalışma (PWA)

## Arkadaşın için kurulum

1. iPhone'da **Safari** ile uygulama adresini aç → **Paylaş** → **Ana Ekrana Ekle**.
2. Mac'te **Safari** → **Dosya → Dock'a Ekle**.
3. Eşitleme: uygulamada **Diğer → Kurulum** sayfasındaki adımları izle (iCloud Drive'da `oymfin` klasörü).

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173/oymfin/
npm run test       # birim + bileşen testleri (Vitest)
npm run test:cov   # kapsam raporu
npm run e2e        # uçtan uca testler (Playwright: Chromium + WebKit/iPhone)
npm run lint && npm run typecheck
npm run build      # dist/
```

İlk e2e çalıştırmasından önce: `npx playwright install chromium webkit`

## Yayınlama (GitHub Pages)

`main` dalına her push'ta GitHub Actions testleri çalıştırır ve geçerse `dist/` klasörünü GitHub Pages'e yayınlar. Repo ayarlarında **Settings → Pages → Source: GitHub Actions** seçili olmalı. Adres: `https://<kullanıcı-adı>.github.io/oymfin/`

> Repo adı veya kullanıcı adı değişirse adres değişir ve cihazlardaki veriler yeni adreste görünmez. Değiştirmeden önce Ayarlar'dan **iCloud'a kaydet** ile dosya alın, sonra yeni adreste **Yedekten tamamen geri yükle**.

## Mimari

| Klasör | İçerik |
|---|---|
| `src/domain` | Saf iş mantığı: para biçimleri, ay hesapları, özet, bütçe, düzenli işlemler, portföy, fiyat ayrıştırma, senkron dosyası, birleştirme |
| `src/db` | Dexie (IndexedDB) şeması, kayıt işlemleri, düzenli işlem üretici, eşitleme içe/dışa aktarma |
| `src/prices` | Canlı fiyat servisi (currency-api + CoinGecko, önbellekli) |
| `src/pages`, `src/components` | Arayüz (React + Tailwind) |
| `e2e` | Playwright testleri |

Tutarlar tamsayı kuruş olarak saklanır; tarihler yerel `YYYY-AA-GG`. Eşitlemede her kayıt `updatedAt` taşır, silmeler "silme kaydı" (tombstone) olarak tutulur; birleştirmede en yeni düzenleme kazanır. Düzenli işlem kayıtları deterministik kimlik (`rec:<kural>:<ay>`) kullandığı için iki cihazda üretilse de tek kayıt olur.
