import { ItemSource } from "@prisma/client";
import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canonicalizeItemName,
  choosePreferredItemLabel,
  mergeQuantities,
} from "@/lib/item-normalization";
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
        canonicalName: z.string().trim().min(1).optional(),
        quantity: z.string().trim().min(1).optional().nullable(),
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
    canonicalName: item.canonicalName?.trim() || canonicalizeItemName(item.originalText),
    quantity: item.quantity ?? null,
    source: item.source ?? ItemSource.MANUAL,
    language: item.language ?? "und",
    confidence: item.confidence ?? 1,
  }));

  const itemsToCreate = [...quickItems, ...explicitItems];
  if (itemsToCreate.length === 0) {
    return Response.json({ error: "No items to create" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    const createdItems: unknown[] = [];
    const mergedItems: Array<{
      id: string;
      title: string;
      quantity: string | null;
      mergedFrom: string;
    }> = [];

    for (const item of itemsToCreate) {
      const canonicalName = item.canonicalName || canonicalizeItemName(item.originalText);

      const existing = canonicalName
        ? await tx.shoppingItem.findFirst({
            where: {
              listId,
              isBought: false,
              canonicalName,
            },
            orderBy: { updatedAt: "desc" },
          })
        : null;

      if (existing) {
        const preferredLabel = choosePreferredItemLabel(existing.originalText, item.originalText);
        const merged = await tx.shoppingItem.update({
          where: { id: existing.id },
          data: {
            originalText: preferredLabel,
            normalizedName: preferredLabel.toLowerCase(),
            canonicalName,
            quantity: mergeQuantities(existing.quantity, item.quantity),
            source: existing.source,
            language: existing.language ?? item.language,
            confidence: Math.max(existing.confidence ?? 0, item.confidence ?? 0),
          },
        });

        mergedItems.push({
          id: merged.id,
          title: merged.originalText,
          quantity: merged.quantity,
          mergedFrom: item.originalText,
        });
        continue;
      }

      const created = await tx.shoppingItem.create({
        data: {
          listId,
          createdById: user.id,
          originalText: item.originalText,
          normalizedName: item.normalizedName,
          canonicalName,
          quantity: item.quantity,
          source: item.source,
          language: item.language,
          confidence: item.confidence,
        },
      });

      createdItems.push(created);
    }

    return { createdItems, mergedItems };
  });

  return Response.json(
    {
      items: result.createdItems,
      mergedItems: result.mergedItems,
    },
    { status: 201 },
  );
}
