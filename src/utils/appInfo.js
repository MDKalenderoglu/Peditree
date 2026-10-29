/**
 * appInfo.js — what "PediTree hakkında" (the logo) says about the app: its
 * version, how to cite it, its licence (CITATION.cff, LICENSE, NOTICE).
 */
import pkg from '../../package.json';

export const APP_VERSION = pkg.version;
// set by vite.config.js (dev server and build); empty where it is not defined
// eslint-disable-next-line no-undef
export const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';
export const REPOSITORY_URL = 'https://github.com/MDKalenderoglu/Peditree';

const trDate = (iso) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

/** "Sürüm 0.9.0 · 30.10.2026" */
export const versionLine = () => [`Sürüm ${APP_VERSION}`, trDate(BUILD_DATE)].filter(Boolean).join(' · ');

/** The citation (Vancouver style, as CITATION.cff). */
export const citationText = () =>
  `Kalenderoğlu MD. PediTree: clinical pedigree drawing for genetic counselling [Yazılım]. Sürüm ${APP_VERSION}. ${(BUILD_DATE || '').slice(0, 4) || new Date().getFullYear()}. ${REPOSITORY_URL}`;
