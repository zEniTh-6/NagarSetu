# PostGIS 3.6 on PostgreSQL 18 (Debian), latest stable tag on Docker Hub as of 2026-10.
FROM postgis/postgis:18-3.6

# pgvector for the same Postgres major (18), from the PGDG apt repo already set up in the image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-pgvector \
 && rm -rf /var/lib/apt/lists/*

# Runs only when the data volume is empty (first start or after `docker compose down -v`).
COPY init.sql /docker-entrypoint-initdb.d/10-init.sql
