import { ItemSource } from "@prisma/client";

export type ParsedQuickItem = {
  originalText: string;
  normalizedName: string;
  quantity: string | null;
  source: ItemSource;
  language: string;
  confidence: number;
};

const quantityRegex = /(\d+[.,]?\d*\s*[a-zA-Zа-яА-Я%]+)$/;

export function parseQuickInput(input: string): ParsedQuickItem[] {
  return input
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((raw) => {
      const quantityMatch = raw.match(quantityRegex);
      const quantity = quantityMatch ? quantityMatch[1].trim() : null;
      const normalizedName = (quantity ? raw.replace(quantityRegex, "") : raw)
        .trim()
        .toLowerCase();

      return {
        originalText: raw,
        normalizedName: normalizedName || raw.toLowerCase(),
        quantity,
        source: ItemSource.MANUAL,
        language: "und",
        confidence: 1,
      };
    });
}
