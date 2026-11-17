/**
 * carrierBasis.js — the words for what a carrier status rests on (model.js
 * CARRIER_BASES; clinician decision 2026-11-17), shared by the screens.
 */
import { t, tk } from '../i18n';

export const BASIS_CHOICES = [
  ['test', tk('Genetik test'), tk('Genetik test sonucu taşıyıcılığı gösterdi (heterozigot varyant); kişi “test yapıldı (+)” olarak işaretlenir')],
  ['obligate', tk('Pedigriden zorunlu'), tk('Kalıtım biçimi gereği taşıyıcı olmak zorunda; örneğin otozomal resesif hastalığı olan çocuğun anne ve babası')],
  ['report', tk('Beyana dayalı'), tk('Hasta ya da ailesinin beyanı; test sonucu görülmedi')],
];

export const basisLabel = (id) => {
  const b = BASIS_CHOICES.find(([v]) => v === id);
  return b ? t(b[1]) : '';
};

