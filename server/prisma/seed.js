// `npx prisma db seed` (or `npm run db:seed`) runs this file.
import { prisma } from "../src/db/prisma.js";
import { seed } from "../src/seed/seed.js";

try {
  const { createdAdmins } = await seed(prisma);
  console.log("Seed complete: departments and categories are in place.");
  if (createdAdmins.length) {
    console.log("\nNew admin accounts. These passwords are shown ONCE. Save them now:");
    console.table(createdAdmins);
    console.log("Each admin must change the password on first login.");
  } else {
    console.log("All admins already existed; no passwords were changed.");
  }
} catch (err) {
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
