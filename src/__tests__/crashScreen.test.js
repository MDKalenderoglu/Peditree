// @vitest-environment jsdom
/**
 * crashScreen.test.js — when the drawing cannot be shown, the page is never left blank (security audit
 * 2026-11-15: a file with a field of an unexpected type made the drawing throw, React took the whole
 * page down, and the clinician had no way back). The real app in a simulated browser, made to fail as an
 * unknown fault would: the notice appears, and each way out works.
 */
import { it, expect, vi, beforeAll } from 'vitest';
import { mount, settle, createElement, act } from './support/dom';
import App from '../App';
import CrashScreen from '../components/CrashScreen';
import { usePedigreeStore } from '../state/usePedigreeStore';

const S = () => usePedigreeStore.getState();
beforeAll(() => { ['error', 'warn'].forEach((k) => vi.spyOn(console, k).mockImplementation(() => {})); });
const button = (root, name) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
// a fault no check knows about yet: a patient name the drawing cannot write
const breakIt = () => act(() => usePedigreeStore.setState((s) => ({ doc: { ...s.doc, patientName: { toString: 1 } } })));

it('a drawing fault shows a notice instead of a blank page; "Bir önceki adıma dön" and "Yeni pedigri başlat" bring the drawing back', async () => {
  await settle(() => S().resetPedigree());
  const view = mount(createElement(CrashScreen, null, createElement(App)));
  await settle(() => S().updateIndividual('proband', { age: '7' }));
  breakIt();
  await settle();
  const alert = view.container.querySelector('.crash-screen[role="alert"]');
  expect(alert).not.toBeNull();
  expect(alert.textContent).toMatch(/Pedigri gösterilemedi/);
  expect(button(alert, 'Pedigriyi indir')).toBeTruthy();
  // back one step: the drawing returns
  await settle(() => button(alert, 'Bir önceki adıma dön').click());
  expect(view.container.querySelector('.crash-screen')).toBeNull();
  expect(view.container.querySelector('#pedigree-svg')).not.toBeNull();
  // and once more, out through a new pedigree
  breakIt();
  await settle();
  await settle(() => button(view.container, 'Yeni pedigri başlat').click());
  expect(view.container.querySelector('.crash-screen')).toBeNull();
  expect(typeof S().doc.patientName === 'string' || S().doc.patientName == null).toBe(true);
  view.unmount();
});
