export type WorkspaceSummary = {
  id: string;
  name: string;
  role: string;
};

export type ShoppingItemDto = {
  id: string;
  originalText: string;
  normalizedName: string;
  quantity: string | null;
  isBought: boolean;
  source: string;
  language: string | null;
  confidence: number | null;
  /** ISO string after server → client serialization */
  updatedAt: string;
};

export type ShoppingListDto = {
  id: string;
  title: string;
  items: ShoppingItemDto[];
};

export type FavoriteProductDto = {
  id: string;
  label: string;
  canonicalName: string;
  quantity: string | null;
};
