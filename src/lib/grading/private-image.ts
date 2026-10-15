import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
const entries = new Map<string, { bytes: Buffer; expires: number }>();
const inflight = new Map<string, Promise<Buffer>>();
const LIMIT = 24 * 1024 * 1024;
// Call only after an owned page/answer lookup and its removal-marker check.
// Cached bytes never replace authentication, RLS or a fresh ownership lookup.
export async function readPrivateImage(
  client: SupabaseClient<Database>,
  teacherId: string,
  path: string,
) {
  if (!path.startsWith(`${teacherId}/`))
    throw new Error("InvalidOwnedImagePath");
  const key = `${teacherId}:${path}`,
    now = Date.now();
  for (const [id, value] of entries)
    if (value.expires < now) entries.delete(id);
  const cached = entries.get(key);
  if (cached) return cached.bytes;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await client.storage
      .from("submission-files")
      .download(path);
    if (error || !data || data.size > 6 * 1024 * 1024)
      throw new Error("PrivateImageUnavailable");
    const bytes = Buffer.from(await data.arrayBuffer());
    let total = bytes.length;
    for (const value of entries.values()) total += value.bytes.length;
    for (const [id, value] of entries) {
      if (total <= LIMIT && entries.size < 24) break;
      entries.delete(id);
      total -= value.bytes.length;
    }
    entries.set(key, { bytes, expires: Date.now() + 60000 });
    return bytes;
  })();
  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}
