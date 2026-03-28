# Duplicate Settlement Remediation

This document describes how to detect and clean up pre-existing duplicate
settlement records before (or after) applying the
`003_create_settlements` migration that adds the
`UNIQUE (bond_id, transaction_hash)` constraint.

## 1. Detect duplicates

Run the following query to identify settlement rows that share the same
`(bond_id, transaction_hash)` pair:

```sql
SELECT bond_id,
       transaction_hash,
       COUNT(*)          AS duplicate_count,
       ARRAY_AGG(id ORDER BY created_at ASC) AS ids
  FROM settlements
 GROUP BY bond_id, transaction_hash
HAVING COUNT(*) > 1
 ORDER BY duplicate_count DESC;
```

If this query returns zero rows, no remediation is necessary.

## 2. Remove duplicates (keep earliest)

For each duplicate group, keep the row with the smallest `created_at`
(first ingested) and delete the rest:

```sql
DELETE FROM settlements
 WHERE id IN (
   SELECT id
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY bond_id, transaction_hash
                ORDER BY created_at ASC
              ) AS rn
         FROM settlements
     ) ranked
    WHERE rn > 1
 );
```

**Run this inside a transaction** so you can verify the affected row
count before committing:

```sql
BEGIN;

-- Check how many rows will be removed
SELECT COUNT(*) AS rows_to_delete
  FROM settlements
 WHERE id IN (
   SELECT id
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY bond_id, transaction_hash
                ORDER BY created_at ASC
              ) AS rn
         FROM settlements
     ) ranked
    WHERE rn > 1
 );

-- If the count looks correct, run the DELETE (same subquery as above)
DELETE FROM settlements
 WHERE id IN (
   SELECT id
     FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY bond_id, transaction_hash
                ORDER BY created_at ASC
              ) AS rn
         FROM settlements
     ) ranked
    WHERE rn > 1
 );

COMMIT;
```

## 3. Apply the migration

After removing duplicates, apply the migration that adds the unique
constraint:

```bash
npm run migrate:dev
```

Or apply the raw SQL migration directly:

```bash
psql "$DATABASE_URL" -f src/migration/003_create_settlements.sql
```

## 4. Verify

Confirm the constraint is in place:

```sql
SELECT conname, contype
  FROM pg_constraint
 WHERE conrelid = 'settlements'::regclass
   AND conname  = 'settlements_bond_tx_unique';
```

Expected output:

```
         conname          | contype
--------------------------+---------
 settlements_bond_tx_unique | u
```

Re-run the duplicate detection query from step 1 to confirm zero
duplicates remain.
