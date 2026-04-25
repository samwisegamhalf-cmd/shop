import type { ShoppingListDto } from "@/types/app";

/**
 * Prisma returns Date and enums; props passed from Server Components to Client
 * Components must be JSON-serializable (Next.js requirement).
 */
export function shoppingListsForClient(lists: unknown): ShoppingListDto[] {
  return JSON.parse(JSON.stringify(lists)) as ShoppingListDto[];
}
