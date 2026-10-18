// Empty every app table between tests (keeps migrations history and PostGIS's spatial_ref_sys).
export async function resetDb(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT string_agg(format('%I', tablename), ', ') AS tables
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  const tables = rows[0]?.tables;
  // Table names come from the catalog and are quoted by format('%I'), not from user input.
  if (tables) await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
