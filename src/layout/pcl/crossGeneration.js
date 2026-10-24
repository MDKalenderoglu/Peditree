/**
 * crossGeneration.js — partners from different generations (clinician
 * decision 2026-10-24, docs/PEDITREE_CLINICAL_NOTATION_SPEC_V1.md §8).
 *
 * Each partner stays on their own generation row. For the layout, the upper
 * partner is represented on the lower partner's row by an invisible stand-in
 * ("ghost") beside the lower partner, so every rule for a couple applies
 * unchanged there: the spouse gap, the couple centred over its children, the
 * line of descent, the divorce slash. routing.js then joins the upper
 * partner to the stand-in with a stepped line; the stand-in is never drawn.
 */
export const isGhost = (ind) => !!(ind && ind.crossGenerationGhost);

export function withGhosts(graph) {
  const byId = new Map((graph.individuals || []).map((i) => [i.id, i]));
  const ghosts = [];
  const unions = (graph.unions || []).map((u) => {
    const [a, b] = u.partners || [];
    const pa = byId.get(a), pb = byId.get(b);
    if (!pa || !pb || typeof pa.generation !== 'number' || typeof pb.generation !== 'number' || pa.generation === pb.generation) return u;
    const [upper, lower] = pa.generation < pb.generation ? [pa, pb] : [pb, pa];
    const ghost = {
      id: `__xg__${u.id}`, sex: upper.sex, generation: lower.generation,
      crossGenerationGhost: true, ghostFor: upper.id, label: '',
    };
    ghosts.push(ghost);
    return { ...u, partners: u.partners.map((p) => (p === upper.id ? ghost.id : p)) };
  });
  if (!ghosts.length) return graph;
  return { ...graph, individuals: [...graph.individuals, ...ghosts], unions };
}
