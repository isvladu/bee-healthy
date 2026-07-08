// Shared allergy / regional-availability constraint lines, used by both the diet
// and recipe prompts (API and subscription variants).

export interface FoodConstraints {
  country?: string; // residence — avoid ingredients hard to find there
  avoid?: string; // allergies / disliked foods to strictly exclude
}

export function foodConstraintLines({ country, avoid }: FoodConstraints): string[] {
  const lines: string[] = [];
  if (avoid?.trim()) {
    lines.push(
      `STRICTLY EXCLUDE these foods (allergies or dislikes) — never include them, or any dish or ingredient containing them: ${avoid.trim()}.`,
    );
  }
  if (country?.trim()) {
    lines.push(
      `The user lives in ${country.trim()}. Use only ingredients that are commonly available there; avoid specialty or imported items that would be hard to find.`,
    );
  }
  return lines;
}
