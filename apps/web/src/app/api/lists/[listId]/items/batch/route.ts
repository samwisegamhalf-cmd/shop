import { ItemSource } from "@prisma/client";
import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseQuickInput } from "@/lib/parseQuickInput";

const sourceEnum = z.enum([
  ItemSource.MANUAL,
  ItemSource.VOICE,
  ItemSource.PHOTO,
  ItemSource.TELEGRAM_TEXT,
  ItemSource.TELEGRAM_VOICE,
  ItemSource.RECIPE,
]);

const payloadSchema = z.object({
  quickInput: z.string().trim().min(1).optional(),
  items: z
    .array(
      z.object({
        originalText: z.string().trim().min(1),
        normalizedName: z.string().trim().min(1),
        quantity: z.string().trim().min(1).optional().nullable(),
        category: z.string().trim().min(1).optional().nullable(),
        source: sourceEnum.optional(),
        language: z.string().trim().min(1).optional().nullable(),
        confidence: z.number().min(0).max(1).optional().nullable(),
      }),
    )
    .optional(),
})
.refine((data) => Boolean(data.quickInput || (data.items && data.items.length > 0)), {
  message: "Either quickInput or items is required",
});

export async function POST(
  request: Request,
  context: RouteContext<"/api/lists/[listId]/items/batch">,
) {
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

  const body = await request.json();
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const quickItems = parsed.data.quickInput ? parseQuickInput(parsed.data.quickInput) : [];
  const explicitItems = (parsed.data.items ?? []).map((item) => ({
    originalText: item.originalText,
    normalizedName: item.normalizedName.toLowerCase(),
    quantity: item.quantity ?? null,
    category: item.category ?? null,
    source: item.source ?? ItemSource.MANUAL,
    language: item.language ?? "und",
    confidence: item.confidence ?? 1,
  }));

  const itemsToCreate = [...quickItems, ...explicitItems];
  if (itemsToCreate.length === 0) {
    return Response.json({ error: "No items to create" }, { status: 400 });
  }

  const createdItems = await db.$transaction(
    itemsToCreate.map((item) =>
      db.shoppingItem.create({
        data: {
          listId,
          createdById: user.id,
          originalText: item.originalText,
          normalizedName: item.normalizedName,
          quantity: item.quantity,
          category: item.category ?? null,
          source: item.source,
          language: item.language,
          confidence: item.confidence,
        },
      }),
    ),
  );

  return Response.json({ items: createdItems }, { status: 201 });
}
