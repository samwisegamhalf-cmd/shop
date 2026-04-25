import { ShoppingApp } from "@/components/shopping-app";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

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

  return (
    <main>
      <ShoppingApp
        workspace={{
          id: membership.workspaceId,
          name: membership.workspace.name,
          role: membership.role,
        }}
        initialLists={lists}
      />
    </main>
  );
}
