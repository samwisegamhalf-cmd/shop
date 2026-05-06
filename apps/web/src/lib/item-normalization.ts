const STOP_WORDS = new Set([
  "свежее",
  "свежий",
  "свежая",
  "охлажденное",
  "охлажденный",
  "замороженное",
  "замороженный",
  "большой",
  "маленький",
  "домашний",
  "домашнее",
]);

const ENDINGS = [
  "иями",
  "ями",
  "ами",
  "иями",
  "ого",
  "ему",
  "ому",
  "ими",
  "ыми",
  "его",
  "ее",
  "ие",
  "ые",
  "ой",
  "ей",
  "ий",
  "ый",
  "ая",
  "яя",
  "ам",
  "ям",
  "ах",
  "ях",
  "ов",
  "ев",
  "ом",
  "ем",
  "ою",
  "ею",
  "ы",
  "и",
  "а",
  "я",
  "у",
  "ю",
  "е",
  "о",
  "ь",
];

export function normalizeItemText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeItemName(value: string): string {
  const normalized = normalizeItemText(value);
  const tokens = normalized
    .split(" ")
    .map((token) => stemToken(token))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).sort((a, b) => a.localeCompare(b, "ru")).join(" ");
}

export function choosePreferredItemLabel(existing: string, incoming: string): string {
  const cleanExisting = existing.trim();
  const cleanIncoming = incoming.trim();

  if (!cleanExisting) return cleanIncoming;
  if (!cleanIncoming) return cleanExisting;

  const existingScore = scoreLabel(cleanExisting);
  const incomingScore = scoreLabel(cleanIncoming);

  return incomingScore > existingScore ? cleanIncoming : cleanExisting;
}

export function mergeQuantities(current: string | null, incoming: string | null): string | null {
  if (!current && !incoming) return null;
  if (!current) return incoming;
  if (!incoming) return current;

  const currentParsed = parseQuantity(current);
  const incomingParsed = parseQuantity(incoming);

  if (!currentParsed || !incomingParsed) {
    return current;
  }

  if (currentParsed.unit !== incomingParsed.unit) {
    return current;
  }

  const total = roundQuantity(currentParsed.amount + incomingParsed.amount);
  return `${formatAmount(total)} ${currentParsed.unit}`.trim();
}

function scoreLabel(value: string): number {
  const normalized = normalizeItemText(value);
  let score = normalized.length;

  if (/[а-я]/i.test(value)) score += 8;
  if (/фарш\s+индейк/i.test(normalized)) score += 4;
  if (/[()]/.test(value)) score -= 2;

  return score;
}

function stemToken(token: string): string {
  let result = token.replace(/[^a-zа-я0-9]/gi, "");

  if (result.length <= 3) return result;

  for (const ending of ENDINGS) {
    if (result.endsWith(ending) && result.length - ending.length >= 4) {
      result = result.slice(0, -ending.length);
      break;
    }
  }

  return result;
}

function parseQuantity(quantity: string): { amount: number; unit: string } | null {
  const match = quantity.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-Я]+)$/);
  if (!match) return null;

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;

  return {
    amount,
    unit: match[2].toLowerCase(),
  };
}

function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString().replace(".", ",");
}
