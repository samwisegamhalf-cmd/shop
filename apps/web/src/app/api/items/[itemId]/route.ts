import { ItemSource } from "@prisma/client";
import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canonicalizeItemName } from "@/lib/item-normalization";

const updateItemSchema = z.object({
  originalText: z.string().trim().min(1).optional(),
  normalizedName: z.string().trim().min(1).optional(),
  quantity: z.string().trim().min(1).nullable().optional(),
  isBought: z.boolean().optional(),
  source: z
    .enum([
      ItemSource.MANUAL,
      ItemSource.VOICE,
      ItemSource.PHOTO,
      ItemSource.TELEGRAM_TEXT,
      ItemSource.TELEGRAM_VOICE,
      ItemSource.RECIPE,
    ])
    .optional(),
  language: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext<"/api/items/[itemId]">) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await db.shoppingItem.findUnique({
    where: { id: itemId },
    include: { list: true },
  });
  if (!item) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hasMembership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: item.list.workspaceId, userId: user.id } },
  });

  if (!hasMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const boughtChanged = typeof parsed.data.isBought === "boolean" && parsed.data.isBought !== item.isBought;

  const updated = await db.shoppingItem.update({
    where: { id: itemId },
    data: {
      ...parsed.data,
      normalizedName: parsed.data.normalizedName?.toLowerCase(),
      canonicalName: parsed.data.originalText
        ? canonicalizeItemName(parsed.data.originalText)
        : parsed.data.normalizedName
          ? canonicalizeItemName(parsed.data.normalizedName)
          : item.canonicalName,
      boughtAt: boughtChanged ? (parsed.data.isBought ? new Date() : null) : item.boughtAt,
    },
  });

  return Response.json({ item: updated });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/items/[itemId]">) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await db.shoppingItem.findUnique({
    where: { id: itemId },
    include: { list: true },
  });
  if (!item) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hasMembership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: item.list.workspaceId, userId: user.id } },
  });

  if (!hasMembership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.shoppingItem.delete({ where: { id: itemId } });
  return Response.json({ ok: true });
}
