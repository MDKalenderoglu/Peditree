/**
 * appInfo.js — what "PediTree hakkında" (the logo) says about the app: its
 * version, how to cite it, its licence (CITATION.cff, LICENSE, NOTICE).
 */
import pkg from '../../package.json';
import { t } from '../i18n';

export const APP_VERSION = pkg.version;
// the stage the app is offered in (clinician decision 2026-11-07: a beta, tried by real users);
// '' once it is 1.0 — the badge by the logo and "(beta)" in the version line follow it
export const RELEASE_STAGE = 'beta';
// set by vite.config.js (dev server and build); empty where it is not defined
// eslint-disable-next-line no-undef
export const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';
export const REPOSITORY_URL = 'https://github.com/MDKalenderoglu/Peditree';
// how to reach the project (clinician decision 2026-11-01): a GitHub form, or e-mail for those without an account
export const CONTACT_EMAIL = 'peditree.app@gmail.com';
/** A new GitHub issue from one of the forms in .github/ISSUE_TEMPLATE. */
export const issueUrl = (form) => `${REPOSITORY_URL}/issues/new?template=${form}.yml`;
// Zenodo's DOI for every version (it always leads to the latest); each
// release also gets its own (v0.9.0: 10.5281/zenodo.23791765)
export const DOI = '10.5281/zenodo.23791764';

const shortDate = (iso) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

/** "Sürüm 0.9.0 (beta) · 30.10.2026" */
export const versionLine = () => [`${t('Sürüm {v}', { v: APP_VERSION })}${RELEASE_STAGE ? ` (${t('beta')})` : ''}`, shortDate(BUILD_DATE)].filter(Boolean).join(' · ');

/** The citation (Vancouver style, as CITATION.cff), in English like the papers it goes into. */
export const citationText = () =>
  `Kalenderoğlu MD. PediTree: clinical pedigree drawing for genetic counselling [Software]. Version ${APP_VERSION}. ${(BUILD_DATE || '').slice(0, 4) || new Date().getFullYear()}. https://doi.org/${DOI}`;
