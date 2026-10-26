/**
 * Where the bundled data lives.
 *
 * The app ships under a base path (the Android shell serves it from one), so
 * every fetch of `public/data` goes through here rather than through a literal
 * path. Its own module because two readers of the data — the passage picker and
 * the Come, Follow Me schedule — need it without needing each other.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dataUrl = (p: string) => `${BASE}/${p.replace(/^\/+/, "")}`;
