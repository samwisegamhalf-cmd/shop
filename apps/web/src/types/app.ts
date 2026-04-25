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
  category: string | null;
  isBought: boolean;
  source: string;
  language: string | null;
  confidence: number | null;
  updatedAt: Date;
};

export type ShoppingListDto = {
  id: string;
  title: string;
  items: ShoppingItemDto[];
};
