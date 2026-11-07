// Who owes whom: each cost split evenly between the people it's for.

export type Cost = { id: string; amount?: number; paid?: string; split?: string[] };

/** Each person's balance: above 0 they're owed, below they owe. */
export function balances(costs: Cost[]) {
  const out: Record<string, number> = {};
  for (const c of costs) {
    const amount = c.amount ?? 0;
    const among = c.split?.length ? c.split : c.paid ? [c.paid] : [];
    if (!c.paid || !among.length || !amount) continue;
    out[c.paid] = (out[c.paid] ?? 0) + amount;
    for (const p of among) out[p] = (out[p] ?? 0) - amount / among.length;
  }
  return out;
}

/** The fewest payments that settle [bal]. */
export function settle(bal: Record<string, number>) {
  const owed = Object.entries(bal).filter(([, v]) => v > 0.005).map(([p, v]) => ({ p, v })).sort((a, b) => b.v - a.v);
  const owes = Object.entries(bal).filter(([, v]) => v < -0.005).map(([p, v]) => ({ p, v: -v })).sort((a, b) => b.v - a.v);
  const pays: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < owes.length && j < owed.length) {
    const n = Math.min(owes[i].v, owed[j].v);
    pays.push({ from: owes[i].p, to: owed[j].p, amount: Math.round(n * 100) / 100 });
    owes[i].v -= n;
    owed[j].v -= n;
    if (owes[i].v < 0.005) i++;
    if (owed[j].v < 0.005) j++;
  }
  return pays;
}
