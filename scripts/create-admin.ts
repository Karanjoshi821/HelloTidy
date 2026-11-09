/**
 * Creates an admin user, or resets the password of an existing one.
 *
 *   npm run admin:create -- --email you@example.com --name "Karan" --role owner
 *
 * The password is read from ADMIN_PASSWORD if set, otherwise a strong random
 * password is generated and printed once.
 */
import "./load-env";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/lib/db/client";
import { adminSessions, adminUsers } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/security/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim() || "Owner";
  const role = arg("role") === "staff" ? "staff" : "owner";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run admin:create -- --email you@example.com --name "Your Name" [--role owner|staff]');
  }

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(15).toString("base64url");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");

  const { db, close, kind } = await createDatabase();
  try {
    const passwordHash = await hashPassword(password);
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (existing) {
      await db
        .update(adminUsers)
        .set({ passwordHash, name, role, active: true, mustChangePassword: false })
        .where(eq(adminUsers.id, existing.id));
      await db.delete(adminSessions).where(eq(adminSessions.userId, existing.id));
      console.log(`Updated ${email} (${role}) in ${kind}. All their sessions were signed out.`);
    } else {
      await db.insert(adminUsers).values({ email, name, role, passwordHash });
      console.log(`Created ${email} (${role}) in ${kind}.`);
    }
    if (generated) console.log(`Password (shown once, store it in a password manager): ${password}`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
