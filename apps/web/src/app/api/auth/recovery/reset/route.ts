import { z } from "zod";

import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const resetSchema = z.object({
  email: z.email().trim(),
  newPassword: z.string().min(6),
  masterKey: z.string().min(8),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = resetSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const configuredMasterKey = process.env.RECOVERY_MASTER_KEY;
  if (!configuredMasterKey) {
    return Response.json({ error: "Recovery is not configured" }, { status: 503 });
  }

  if (parsed.data.masterKey !== configuredMasterKey) {
    return Response.json({ error: "Invalid recovery key" }, { status: 401 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await db.session.deleteMany({ where: { userId: user.id } });

  return Response.json({ ok: true });
}
