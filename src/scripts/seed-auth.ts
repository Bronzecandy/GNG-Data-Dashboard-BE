import "../load-env";
import { prisma } from "../utils/prisma";
import { PERMISSION_KEYS } from "../types/auth";
import { grantAllPermissions } from "../services/auth.service";

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log("[seed:auth] ADMIN_BOOTSTRAP_EMAIL not set — skipping");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", role: "SUPER_ADMIN" },
    });
    await grantAllPermissions(existing.id);
    console.log(`[seed:auth] updated bootstrap admin: ${email}`);
    return;
  }

  console.log(`[seed:auth] no user yet for ${email} — will bootstrap on first Google login`);
  for (const permissionKey of PERMISSION_KEYS) {
    console.log(`[seed:auth] permission key registered: ${permissionKey}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
