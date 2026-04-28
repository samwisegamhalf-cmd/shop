import { z } from "zod";

import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const registerSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(6),
  displayName: z.string().trim().min(1).max(80).optional(),
  workspaceName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { password, displayName, workspaceName } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return Response.json({ error: "User already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const created = await db.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      memberships: {
        create: {
          role: "owner",
          workspace: {
            create: {
              name: workspaceName,
              lists: {
                create: {
                  title: "Основной список",
                },
              },
            },
          },
        },
      },
    },
  });

  await createSession(created.id);

  return Response.json({ ok: true, userId: created.id });
}
