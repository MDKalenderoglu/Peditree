/**
 * A time ceiling of the layout (the product budgets: 100 people < 500 ms, 300 < 2 s; the stress pedigrees
 * of 387 and 474 people). Measured on this project's own computer, the ceiling is as written. GitHub's shared CI machines run the same layout about twice as
 * slowly, so there the ceiling is twice as long. Only the time differs: every check of the drawing
 * itself (invariants, readability, stability) is the same everywhere.
 */
export const CI_SLOWDOWN = process.env.CI ? 2 : 1;
export const budget = (ms) => ms * CI_SLOWDOWN;
