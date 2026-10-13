import "server-only";
import { throwDatabaseError } from "@/lib/database/errors";

// Complete small catalogues/options even when the project's REST row cap changes.
// The caller supplies a fresh tenant-filtered query and stable order for each page.
export async function readAllRows<T extends { id: string }>(
  operation: string,
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { code?: string } | null;
    count: number | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  do {
    const { data, error, count } = await readPage(
      rows.length,
      rows.length + 499,
    );
    if (
      error ||
      !data ||
      count === null ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      throwDatabaseError(operation, error ?? { code: "MissingCount" });
    if (
      (expected !== undefined && expected !== count) ||
      (!data.length && rows.length < count)
    )
      throwDatabaseError(operation, { code: "CatalogueChanged" });
    expected = count;
    for (const row of data) {
      if (ids.has(row.id))
        throwDatabaseError(operation, { code: "CatalogueChanged" });
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > expected)
      throwDatabaseError(operation, { code: "CatalogueChanged" });
  } while (rows.length < expected);
  return rows;
}
