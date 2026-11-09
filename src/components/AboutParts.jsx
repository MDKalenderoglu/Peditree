/**
 * AboutParts.jsx — what the program says about itself, in parts (clinician
 * request 2026-11-04): the logo opens the product and its licence; "Atıf"
 * and "Geri bildirim" in the top bar open how to cite it and how to report a
 * bug; Ayarlar → Hakkında holds them all, and Ayarlar → Klavye kısayolları
 * the keyboard help. One source for each part, wherever it is shown.
 */
import { useState } from 'react';
import { useT, useLang, tk } from '../i18n';
import { KEY_LETTERS } from '../utils/keyboardNav';
import { versionLine, citationText, REPOSITORY_URL, CONTACT_EMAIL, issueUrl, RELEASE_STAGE } from '../utils/appInfo';
import logoMark from '../assets/logo-mark.png';

/** Name, version, what it is not, where the data stays. */
export function ProductInfo() {
  const t = useT();
  return (
    <>
      <div className="about-head">
        <img src={logoMark} alt="" width="56" height="56" />
        <div>
          <div className="keys-title">PediTree</div>
          <div className="field-hint">{t('Genetik danışmanlık için pedigri çizimi')} · {versionLine()}</div>
        </div>
      </div>
      {RELEASE_STAGE && <p className="share-note">{t('Bu bir deneme (beta) sürümüdür. Hata ya da eksik görürseniz “Geri bildirim” ile yazın.')}</p>}
      <p className="share-note">{t('PediTree bir çizim aracıdır, tıbbi cihaz değildir. Çizimi kullanmadan önce kontrol edin; tanı ve danışmanlık kararı klinik değerlendirmeye dayanır.')}</p>
      <p className="share-note">{t('Hasta bilgisi hiçbir sunucuya gönderilmez. Çalışma yalnızca bu sekmede tutulur; “Kaydet” ile indirdiğiniz dosyalar sizin cihazınızda kalır.')}</p>
    </>
  );
}

/** The licence and the copyright line (Apache 2.0 already leaves the name and logo out, §6). */
export function LicenseInfo({ title = true }) {
  const t = useT();
  return (
    <>
      {title && <div className="more-title">{t('Lisans')}</div>}
      <p className="share-note">{t('Kaynak kodu Apache 2.0 lisansıyla açıktır:')} <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">{REPOSITORY_URL.replace('https://', '')}</a></p>
      <p className="share-note">© 2026 Muhammed Doğukan Kalenderoğlu</p>
    </>
  );
}

/** How to cite PediTree, with a button that copies it. */
export function CitationInfo({ title = true }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(citationText()); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <>
      {title && <div className="more-title">{t('Atıf')}</div>}
      <p className="share-note">{t('PediTree ile çizdiğiniz pedigriler sizindir. Bir yayında, sunumda ya da eğitim materyalinde kullandıysanız atıf yapmanız rica edilir:')}</p>
      <p className="about-cite">{citationText()}</p>
      <button className="ui-btn" onClick={copy}>{copied ? t('Kopyalandı') : t('Atfı kopyala')}</button>
    </>
  );
}

/** Reporting a bug or sharing a suggestion: the GitHub forms, or e-mail. */
export function FeedbackInfo({ title = true }) {
  const t = useT();
  return (
    <>
      {title && <div className="more-title">{t('Hata ve öneriler')}</div>}
      <p className="share-note">{t('Bir hata mı buldunuz, bir öneriniz ya da deneyiminiz mi var? GitHub’daki formu doldurun ya da e-posta gönderin.')}</p>
      <div className="about-links">
        <a className="ui-btn" href={issueUrl('hata-bildirimi')} target="_blank" rel="noreferrer">{t('Hata bildir')}</a>
        <a className="ui-btn" href={issueUrl('oneri')} target="_blank" rel="noreferrer">{t('Öneri paylaş')}</a>
        <a className="ui-btn" href={`mailto:${CONTACT_EMAIL}?subject=PediTree`}>{t('E-posta')}</a>
      </div>
      <p className="share-note">{CONTACT_EMAIL} · {t('Bildirime hasta adı, doğum tarihi ya da kimliği belli eden bir ekran görüntüsü eklemeyin.')}</p>
    </>
  );
}

// written for a clinician who has never used the program (clinician request 2026-10-27)
const KEY_HELP = [
  [tk('Kişiler arasında gezinmek'), [
    ['Tab', tk('Sıradaki kişiye geçer.')],
    [{ text: tk('Enter veya Boşluk') }, tk('Üzerinde durduğunuz kişiyi seçer; kişinin çevresinde düğmeler açılır.')],
    ['← →', tk('Aynı kuşakta soldaki ya da sağdaki kişiye geçer.')],
    ['↑', tk('Kişinin annesine ya da babasına geçer.')],
    ['↓', tk('Kişinin çocuğuna geçer.')],
    ['Esc', tk('Bir adım geri gider: önce açık paneli, sonra kişinin çevresindeki düğmeleri, en son seçimi kapatır. Çizimde boş bir yere tıklamak da aynısını yapar.')],
    [{ text: tk('Cmd veya Ctrl + tıklama') }, tk('Birden çok kişiyi birlikte seçer (Mac’te Cmd, Windows’ta Ctrl). Tablette üstteki “Çoklu seçim” düğmesini kullanın.')],
  ]],
  [tk('Seçili kişi için (önce bir kişiye tıklayın)'), [
    // a letter of the interface's language (keyboardNav.js KEY_LETTERS)
    [{ action: 'parents' }, tk('Annesini ve babasını ekler.')],
    [{ action: 'spouse' }, tk('Eşini ekler.')],
    [{ action: 'left' }, tk('Kardeş ekler: kız, erkek, düşük … seçenekleri açılır.')],
    [{ action: 'bottom' }, tk('Çocuk ekler: kız, erkek, düşük … seçenekleri açılır.')],
    [{ action: 'findings' }, tk('Bulgu (hastalık ya da özellik) ekler ya da değiştirir.')],
    [{ action: 'status' }, tk('Durumunu değiştirir: cinsiyet, hasta (etkilenmiş), taşıyıcı, vefat, proband, danışan.')],
    [{ action: 'twins' }, tk('İkiz kardeş ekler.')],
    [{ action: 'note' }, tk('Bilgiler düğmesini açar: yaş, genetik sonuç, not.')],
    ['Shift + ← →', tk('Kişiyi yana kaydırır: eşiyle yer değiştirir ya da kardeşlerinin arasında bir sıra kayar. Kişiyi fareyle sürükleyerek de yapılır.')],
    ['Delete', tk('Kişiyi siler (önce sorar).')],
  ]],
  [tk('Genel'), [
    ['Cmd/Ctrl + Z', tk('Son işlemi geri alır. Shift ile birlikte: geri alınan işlemi yeniden yapar.')],
    ['Cmd/Ctrl + S', tk('Pedigriyi bilgisayarınıza dosya olarak kaydeder.')],
    ['Cmd/Ctrl + P', tk('Pedigriyi A4 sayfaya yazdırır.')],
    ['+  −  0', tk('Yakınlaştırır, uzaklaştırır, tüm pedigriyi ekrana sığdırır.')],
  ]],
];

/** The keyboard help, grouped; the letters are those of the interface's language. */
export function KeyHelp() {
  const t = useT();
  const { ui } = useLang();
  return (
    <div className="key-help">
      {KEY_HELP.map(([group, rows]) => (
        <table key={group}>
          <caption>{t(group)}</caption>
          <tbody>
            {rows.map(([k, text]) => {
              const key = typeof k === 'string' ? k : k.action ? KEY_LETTERS[ui][k.action] : t(k.text);
              return <tr key={key}><td><kbd>{key}</kbd></td><td>{t(text)}</td></tr>;
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
