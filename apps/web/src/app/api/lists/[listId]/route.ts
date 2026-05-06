import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";

const updateListSchema = z.object({
  title: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(32).optional(),
  color: z.string().trim().min(1).max(32).optional(),
});

export async function PATCH(request: Request, context: RouteContext<"/api/lists/[listId]">) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await context.params;
  const body = await request.json();
  const parsed = updateListSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const list = await db.shoppingList.findUnique({ where: { id: listId } });
  if (!list) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hasMembership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: list.workspaceId, userId: user.id } },
  });

  if (!hasMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await db.shoppingList.update({
    where: { id: listId },
    data: {
      title: parsed.data.title,
      icon: parsed.data.icon,
      color: parsed.data.color,
    },
  });

  return Response.json({ list: updated });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/lists/[listId]">) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { listId } = await context.params;
  const list = await db.shoppingList.findUnique({ where: { id: listId } });
  if (!list) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hasMembership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: list.workspaceId, userId: user.id } },
  });

  if (!hasMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.shoppingList.update({
    where: { id: listId },
    data: { archivedAt: new Date() },
  });

  return Response.json({ ok: true });
}
