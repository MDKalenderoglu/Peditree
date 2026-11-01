/**
 * lang.js — every test starts in Turkish, whatever the machine's language
 * (the app's first language follows the browser's; i18n/index.js). A test
 * of the English screens switches with `useLang.getState().setLang`.
 */
import { useLang } from '../../i18n';

useLang.getState().setLang({ ui: 'tr', drawing: 'same' });
