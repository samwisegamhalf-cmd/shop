import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";

const payloadSchema = z.object({
  listId: z.string().min(1),
});

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ activeListId: user.activeListId ?? null });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const list = await db.shoppingList.findUnique({
    where: { id: parsed.data.listId },
  });

  if (!list) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: list.workspaceId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.user.update({
    where: { id: user.id },
    data: { activeListId: parsed.data.listId },
  });

  return Response.json({ ok: true });
}
