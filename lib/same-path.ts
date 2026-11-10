// A redirect target that cannot leave the site.
//
// Checking the input is not enough. The URL parser strips tab and newline,
// treats a backslash like a slash, and collapses dot segments, so "/.//evil"
// resolves to the path "//evil", which a browser reads as another host. So the
// input is screened, resolved against a fixed origin, and then the OUTPUT is
// checked: it must not be protocol-relative, and resolving it again must land
// on the same origin.

const BASE = "https://same-path.invalid";
// Control characters (C0 and DEL) and backslashes are never part of a path we produce.
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

function staysHere(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || UNSAFE.test(path)) return false;
  try {
    return new URL(path, BASE).origin === BASE;
  } catch {
    return false;
  }
}

/** `value` as pathname + search + hash on this site, or null if it could go anywhere else. */
export function samePath(value: string | null | undefined): string | null {
  if (!value || !staysHere(value)) return null;
  const url = new URL(value, BASE);
  const out = url.pathname + url.search + url.hash;
  return staysHere(out) ? out : null;
}

/** `path` on this site (home if it isn't one) with `key=value` added to its query. */
export function withParam(path: string, key: string, value: string): string {
  const url = new URL(samePath(path) ?? "/", BASE);
  url.searchParams.set(key, value);
  return samePath(url.pathname + url.search + url.hash) ?? `/?${new URLSearchParams({ [key]: value })}`;
}
