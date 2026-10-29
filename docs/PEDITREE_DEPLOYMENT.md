# PediTree — yayın (Cloudflare Pages)

Karar 2026-10-29: PediTree sunucusuz, statik bir site olarak Cloudflare Pages'te yayınlanır.
Hasta verisi hiçbir sunucuya gitmez; site yalnızca uygulamanın kendi dosyalarını sunar.

## Kurulum (bir kez, kullanıcı yapar)

1. cloudflare.com'da ücretsiz hesap → **Workers & Pages → Create → Pages → Connect to Git**.
2. GitHub'daki `MDKalenderoglu/Peditree` deposunu seçin (depo gizli kalabilir).
3. Ayarlar:
   - Framework preset: **None** (ya da Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`
   - Node sürümü depodaki `.node-version` dosyasından okunur (22).
4. **Save and Deploy**. Adres: `<proje-adı>.pages.dev`.
5. Diğer dallar (ör. `stabilization/clinical-layout`) kendi deneme adreslerinde yayınlanır:
   `<dal-adı>.<proje-adı>.pages.dev`. Önce orada denenir, sonra `main`'e birleştirilir.

## Depodaki yayın dosyaları

| Dosya | Görevi |
|---|---|
| `public/_headers` | Güvenlik başlıkları: sayfa yalnızca kendi dosyalarını yükler, hiçbir yere veri gönderemez (CSP `connect-src 'self'`, `form-action 'none'`); başka sitede çerçeve içinde açılamaz; arama motorlarına kapalı (`X-Robots-Tag`). `/assets/*` uzun süre önbellekte, sayfanın kendisi her açılışta denetlenir (güncelleme herkese hemen ulaşır). |
| `public/robots.txt`, `<meta name="robots">` | Pilot süresince arama motorlarına kapalı. |
| `public/manifest.webmanifest`, `public/icon-*.png` | Tablet / telefonda "Ana ekrana ekle" ile uygulama gibi açılır. |
| `.node-version` | Cloudflare'in derlemede kullandığı Node sürümü (Vite 8 için ≥ 20.19). |

Çevrimdışı çalışma (service worker) bilerek eklenmedi: eski bir sürümün cihazda takılı kalması
klinik bir araçta risk; pilottan sonra güncelleme uyarısıyla birlikte ele alınacak.

## Yerelde deneme

`npm run build`, ardından `dist/` klasörünü `_headers` kurallarıyla sunan herhangi bir sunucu
(Cloudflare'in `npx wrangler pages dev dist` komutu ya da benzeri). 2026-10-29'da bu kurallarla
denendi: uygulama açılıyor, el çizimi ve el yazısı tipleri yükleniyor, paylaşım için PNG
(gömülü yazı tipiyle) oluşuyor; hiçbir güvenlik ihlali kaydı yok.
