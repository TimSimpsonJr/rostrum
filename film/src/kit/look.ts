// What a film takes from outside the kit, property by property: the brand's value, else the recorded site's own
// (film/clean/site.json: the accent of its buttons, the font of its page), else none (the kit's default look).
// Stage A uses `accent` in one place only: the end card's sweep, when the brand's mark names no gradient of its own.
// `font` is resolved and carried, not yet applied (a film is set in the kit's font until a later stage decides).
export type Look = { accent: string | null; font: string | null };
type Has = { colours?: { accent?: string | null } | null; accent?: string | null; font?: string | null } | null | undefined;

export function resolveLook(brand: Has, site: Has): Look {
  return { accent: brand?.colours?.accent ?? brand?.accent ?? site?.accent ?? null, font: brand?.font ?? site?.font ?? null };
}
