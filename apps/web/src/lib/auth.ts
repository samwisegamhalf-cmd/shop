import { randomBytes } from "crypto";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";

const SESSION_COOKIE = "shop_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? "30");

export async function hashPassword(rawPassword: string): Promise<string> {
  return bcrypt.hash(rawPassword, 10);
}

export async function verifyPassword(rawPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(rawPassword, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return token;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.session.deleteMany({ where: { token } });
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              workspace: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (token) {
      await db.session.deleteMany({ where: { token } });
    }
    cookieStore.delete(SESSION_COOKIE);
    redirect("/login");
  }

  return session;
}

export async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    await db.session.deleteMany({ where: { token } });
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return session.user;
}
