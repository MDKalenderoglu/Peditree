/**
 * shownKey.js — the findings' marks as the drawing shows them with the carrier
 * mark chosen in Ayarlar (graph/conditionKey.js displayStyles): with "Yarısı
 * siyah (klasik)" a finding that would meet a carrier's solid half is drawn in
 * another pattern, and the finding lists show that one too (clinician
 * 2026-11-16). The stored key never changes.
 */
import { useMemo } from 'react';
import { displayStyles, suggestNewStyle, suggestStyle } from '../graph/conditionKey';
import { useViewSettings } from './drawingStyle';

export function useShownKey(conditionKey = [], people) {
  const mark = useViewSettings((s) => s.view.carrierMark);
  return useMemo(() => (people ? displayStyles(people, conditionKey, mark).key : conditionKey), [people, conditionKey, mark]);
}

export const shownEntry = (shownKey, e) => shownKey.find((x) => x.id === e.id) || e;

/** Moved off black for the carriers: black cannot be chosen for it while that view is on. */
export const movedOffBlack = (stored, shown) => stored.fill === 'solid' && shown.fill !== stored.fill;

/**
 * The pattern offered a new finding for `ids`, as the drawing will show it
 * (conditionKey.js suggestNewStyle); blackHeld: black is the proband's or a
 * carrier's here, so it is not offered (clinician report 2026-11-18).
 */
export function useNewStyle(conditionKey = [], people, ids = []) {
  const mark = useViewSettings((s) => s.view.carrierMark);
  const who = ids.join('\u0001');
  return useMemo(() => {
    const style = suggestNewStyle(people || [], conditionKey, mark, who ? who.split('\u0001') : []);
    const first = suggestStyle(conditionKey);
    return { style, blackHeld: !!(style && first && first.fill === 'solid' && style.fill !== 'solid') };
  }, [people, conditionKey, mark, who]);
}
