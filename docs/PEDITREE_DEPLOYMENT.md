# PediTree — yayın

PediTree sunucusuz, statik bir sitedir: **Netlify, `https://peditree.netlify.app`** (ücretsiz plan,
`main` dalından otomatik). Hasta verisi hiçbir sunucuya gitmez; site yalnızca uygulamanın kendi
dosyalarını sunar.

## Netlify ayarları

- Branch to deploy: `main`
- Build command: `npm run build`
- Publish directory: `dist`
- Node sürümü depodaki `.node-version` dosyasından okunur.

`public/_headers` Netlify'da geçerlidir. Canlıda denetlendi (2026-11-07): CSP, HSTS,
`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, `X-Robots-Tag` geliyor;
`/assets/*` uzun süre önbellekte, sayfa `no-cache`; http → https; robots kapalı.

Netlify ücretsiz planda sayfaya kendi araç çubuğu betiğini (`/.netlify/scripts/hud`) ekliyor; bu
betiğin satır içi kodunu CSP engelliyor (konsolda tek bir uyarı). Uygulamayı etkilemiyor, dışarı veri
gönderemiyor (`connect-src 'self'`).

Uzun vade: paylaşılan alt alan adları toplu engellenebiliyor; kendi alan adı bu riski kaldırır ve
Netlify'a (Domain management) birkaç tıklamayla bağlanır.

## Depodaki yayın dosyaları

| Dosya | Görevi |
|---|---|
| `public/_headers` | Güvenlik başlıkları: sayfa yalnızca kendi dosyalarını yükler, hiçbir yere veri gönderemez (CSP `connect-src 'self'`, `form-action 'none'`); başka sitede çerçeve içinde açılamaz; arama motorlarına kapalı (`X-Robots-Tag`). `/assets/*` uzun süre önbellekte, sayfanın kendisi her açılışta denetlenir (güncelleme herkese hemen ulaşır). |
| `public/robots.txt`, `<meta name="robots">` | Pilot süresince arama motorlarına kapalı. |
| `public/manifest.webmanifest`, `public/icon-*.png` | Tablet / telefonda "Ana ekrana ekle" ile uygulama gibi açılır. |
| `.node-version` | Netlify'ın derlemede kullandığı Node sürümü (Vite 8 için ≥ 20.19). |

Çevrimdışı çalışma (service worker) bilerek eklenmedi: eski bir sürümün cihazda takılı kalması
klinik bir araçta risk; pilottan sonra güncelleme uyarısıyla birlikte ele alınacak.

## Yerelde deneme

`npm run build`, ardından `npx vite preview` ile `dist/` açılır. Güvenlik başlıklarını
(`public/_headers`) yalnızca Netlify uygular; bunlar canlı sitede denetlenir.
