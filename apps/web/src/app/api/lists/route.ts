import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";

const createListSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(32).optional(),
  color: z.string().trim().min(1).max(32).optional(),
});

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return Response.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const hasMembership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });

  if (!hasMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const lists = await db.shoppingList.findMany({
    where: { workspaceId, archivedAt: null },
    include: {
      items: {
        orderBy: [{ isBought: "asc" }, { updatedAt: "desc" }],
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json({ lists });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createListSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { workspaceId, title, icon, color } = parsed.data;
  const hasMembership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });

  if (!hasMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const list = await db.shoppingList.create({
    data: {
      workspaceId,
      title,
      icon: icon ?? "list",
      color: color ?? "teal",
    },
  });

  return Response.json({ list }, { status: 201 });
}
