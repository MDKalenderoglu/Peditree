// Lists the texts the code translates that the English dictionary lacks.
import { translationKeys } from '../src/i18n/keys.js';
import EN from '../src/i18n/en.js';

const keys = translationKeys();
const miss = [...keys].filter(([k]) => !Object.prototype.hasOwnProperty.call(EN, k));
for (const [k, f] of miss) console.log(JSON.stringify(k), '//', [...new Set(f)].join(', '));
const unused = Object.keys(EN).filter((k) => !keys.has(k));
if (unused.length) console.log(`\nnot used (${unused.length}):\n${unused.map((k) => JSON.stringify(k)).join('\n')}`);
console.log(`\n${miss.length} missing of ${keys.size}`);
