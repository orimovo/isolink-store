// A recipe from a web page, read from its schema.org Recipe (JSON-LD),
// which nearly every recipe site has.

export type Found = { name: string; minutes?: number; serves?: number; ingredients: string; method: string; link: string };

const text = (v: unknown): string =>
  typeof v === 'string'
    ? v.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim()
    : '';

/** ISO 8601 durations such as PT1H30M, in minutes. */
export function isoMinutes(v: unknown) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(String(v ?? ''));
  if (!m) return undefined;
  const n = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return n > 0 ? n : undefined;
}

function steps(v: unknown): string[] {
  if (typeof v === 'string') return v.split(/\n+/).map(text).filter(Boolean);
  if (!Array.isArray(v)) return [];
  return v.flatMap((s: any) =>
    typeof s === 'string' ? [text(s)] : s?.['@type'] === 'HowToSection' ? steps(s.itemListElement) : [text(s?.text ?? s?.name)],
  ).filter(Boolean);
}

function recipeIn(j: any): any {
  if (!j || typeof j !== 'object') return null;
  if (Array.isArray(j)) return j.map(recipeIn).find(Boolean) ?? null;
  const type = j['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return j;
  return recipeIn(j['@graph']) ?? recipeIn(j.mainEntity);
}

export function readRecipe(html: string, link: string): Found | null {
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let j: unknown;
    try {
      j = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const r = recipeIn(j);
    if (!r) continue;
    const yields = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
    const serves = Number(/\d+/.exec(String(yields ?? ''))?.[0]);
    const list = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map(text).filter(Boolean);
    return {
      name: text(r.name).slice(0, 120) || link,
      minutes: isoMinutes(r.totalTime) ?? isoMinutes(r.cookTime),
      serves: serves > 0 && serves <= 50 ? serves : undefined,
      ingredients: list.join('\n').slice(0, 8000),
      method: steps(r.recipeInstructions).map((s, i) => `${i + 1}. ${s}`).join('\n').slice(0, 32000),
      link,
    };
  }
  return null;
}
