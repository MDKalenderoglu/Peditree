/**
 * about.test.js — the logo opens "PediTree hakkında": version, not a medical
 * device, where patient data stays, how to cite, licence (clinician decision
 * 2026-10-30: Apache-2.0, name and logo not licensed).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION, BUILD_DATE, versionLine, citationText, REPOSITORY_URL } from '../utils/appInfo';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');

describe('PediTree hakkında', () => {
  it('version and build date come from package.json and the build', () => {
    expect(APP_VERSION).toBe(JSON.parse(read('package.json')).version);
    expect(BUILD_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(versionLine()).toMatch(/^Sürüm \d+\.\d+\.\d+ · \d{2}\.\d{2}\.\d{4}$/);
  });

  it('the citation names the author, version and repository, as CITATION.cff', () => {
    const cff = read('CITATION.cff');
    expect(citationText()).toContain('Kalenderoğlu MD');
    expect(citationText()).toContain(`Sürüm ${APP_VERSION}`);
    expect(citationText()).toContain(REPOSITORY_URL);
    expect(cff).toMatch(new RegExp(`version: "${APP_VERSION.replace(/\./g, '\\.')}"`));
    expect(cff).toContain(`repository-code: "${REPOSITORY_URL}"`);
  });

  it('licence: Apache-2.0 everywhere; name and logo stay out of it', () => {
    expect(read('LICENSE')).toMatch(/Apache License\s+Version 2\.0, January 2004/);
    expect(JSON.parse(read('package.json')).license).toBe('Apache-2.0');
    expect(read('CITATION.cff')).toMatch(/license: Apache-2\.0/);
    expect(read('NOTICE')).toMatch(/"PediTree" and the PediTree logo .* are not licensed/s);
  });

  it('the logo opens it, and it says what PediTree is not', () => {
    const app = read('src/App.jsx');
    expect(app).toMatch(/aria-label="PediTree hakkında"/);
    expect(app).toMatch(/tıbbi cihaz değildir/);
    expect(app).toMatch(/PediTree adı ve logosu lisansa dahil değildir/);
  });
});
