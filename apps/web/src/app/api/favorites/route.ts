import { z } from "zod";

import { getAuthUser } from "@/lib/auth";
import { db } from "@/lib/db";

const createSchema = z.object({
  workspaceId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  canonicalName: z.string().trim().min(1).max(200),
  quantity: z.string().trim().min(1).nullable().optional(),
});

const deleteSchema = z.object({
  workspaceId: z.string().min(1),
  canonicalName: z.string().trim().min(1).max(200),
});

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return Response.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const favorites = await db.favoriteProduct.findMany({
    where: { userId: user.id, workspaceId },
    orderBy: [{ updatedAt: "desc" }, { label: "asc" }],
  });

  return Response.json({ favorites });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: user.id } },
  });

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const favorite = await db.favoriteProduct.upsert({
    where: {
      userId_workspaceId_canonicalName: {
        userId: user.id,
        workspaceId: parsed.data.workspaceId,
        canonicalName: parsed.data.canonicalName,
      },
    },
    update: {
      label: parsed.data.label,
      quantity: parsed.data.quantity ?? null,
    },
    create: {
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      label: parsed.data.label,
      canonicalName: parsed.data.canonicalName,
      quantity: parsed.data.quantity ?? null,
    },
  });

  return Response.json({ favorite }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: user.id } },
  });

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.favoriteProduct.deleteMany({
    where: {
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      canonicalName: parsed.data.canonicalName,
    },
  });

  return Response.json({ ok: true });
}
