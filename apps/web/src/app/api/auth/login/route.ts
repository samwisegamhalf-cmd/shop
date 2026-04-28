import { z } from "zod";

import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const loginSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { password } = parsed.data;
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
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await createSession(user.id);
  return Response.json({ ok: true });
}
