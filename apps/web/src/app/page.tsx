import { ShoppingApp } from "@/components/shopping-app";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { shoppingListsForClient } from "@/lib/serializeForClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireAuth();
  const membership = session.user.memberships[0];

  if (!membership) {
    return <main style={{ padding: 20 }}>No workspace assigned.</main>;
  }

  const lists = await db.shoppingList.findMany({
    where: {
      workspaceId: membership.workspaceId,
      archivedAt: null,
    },
    include: {
      items: {
        orderBy: [{ isBought: "asc" }, { updatedAt: "desc" }],
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const initialLists = shoppingListsForClient(lists);
  const favorites = await db.favoriteProduct.findMany({
    where: {
      userId: session.user.id,
      workspaceId: membership.workspaceId,
    },
    orderBy: [{ updatedAt: "desc" }, { label: "asc" }],
  });

  const preferredListId: string = lists.some((list) => list.id === session.user.activeListId)
    ? session.user.activeListId ?? ""
    : lists[0]?.id ?? "";

  return (
    <main>
      <ShoppingApp
        workspace={{
          id: membership.workspaceId,
          name: membership.workspace.name,
          role: membership.role,
        }}
        initialLists={initialLists}
        initialActiveListId={preferredListId}
        initialFavorites={favorites.map((item) => ({
          id: item.id,
          label: item.label,
          canonicalName: item.canonicalName,
          quantity: item.quantity,
        }))}
      />
    </main>
  );
}
