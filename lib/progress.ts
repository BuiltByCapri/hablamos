// What the student has got right and missed. Task 10 extends this file;
// these two functions are the subset the flashcard "to revisit" filter needs.
// `came_up` is its own outcome: it is never counted as right or missed.

export type ResultRow = { itemId: string; outcome: string; at: Date | string };
export type ItemStat = {
  right: number;
  missed: number;
  cameUp: number;
  /** The most recent outcome of any kind. */
  lastOutcome: string;
  lastAt: Date;
  /** The most recent right or missed outcome, ignoring came_up. */
  lastAnswer: "right" | "missed" | null;
};

export function itemStats(results: ResultRow[]): Map<string, ItemStat> {
  const stats = new Map<string, ItemStat>();
  const sorted = results
    .map((r) => ({ ...r, at: new Date(r.at) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const r of sorted) {
    const s = stats.get(r.itemId) ?? { right: 0, missed: 0, cameUp: 0, lastOutcome: r.outcome, lastAt: r.at, lastAnswer: null };
    if (r.outcome === "right") {
      s.right++;
      s.lastAnswer = "right";
    } else if (r.outcome === "missed") {
      s.missed++;
      s.lastAnswer = "missed";
    } else if (r.outcome === "came_up") s.cameUp++;
    s.lastOutcome = r.outcome;
    s.lastAt = r.at;
    stats.set(r.itemId, s);
  }
  return stats;
}

/**
 * Items missed at least twice in total, or missed in their most recent right
 * or missed result. Ordered by lastAt, which includes came_up times. `now` is accepted so Task 10 can
 * add a recency window without changing callers.
 */
export function toRevisit(stats: Map<string, ItemStat>, now: Date): string[] {
  void now;
  const out: { id: string; at: number }[] = [];
  for (const [id, s] of stats) {
    if (s.missed >= 2 || s.lastAnswer === "missed") out.push({ id, at: s.lastAt.getTime() });
  }
  return out.sort((a, b) => b.at - a.at).map((o) => o.id);
}
