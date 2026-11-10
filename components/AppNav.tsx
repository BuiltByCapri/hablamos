"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "../app/actions";

// Call is the speaking practice (/practice). It stays out of the bar until
// that page exists, so nobody taps into a 404.
const CALL_READY = false;

const isCurrent = (path: string, href: string) =>
  href === "/"
    ? path === "/"
    : path === href || path.startsWith(`${href}/`) || (href === "/flashcards" && (path === "/quiz" || path.startsWith("/quiz/")));

/** The bar on every signed-in page: the wordmark, then Letters, Practice, Add, Call and Notes, and Students for a tutor. */
export function AppNav({ tutor }: { tutor: boolean }) {
  const path = usePathname();
  const links: [string, string][] = [
    ["/", "Letters"],
    ["/flashcards", "Practice"],
    ["/add", "Add"],
    ...(CALL_READY ? ([["/practice", "Call"]] as [string, string][]) : []),
    ["/notes", "Notes"],
  ];
  if (tutor) links.push(["/tutor", "Students"]);
  return (
    <header className="bar">
      <Link href="/" className="brand">
        Hablamos
      </Link>
      <nav className="nav" aria-label="Main">
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-current={isCurrent(path, href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** The quieter links at the foot of each signed-in page: how it works, grammar and reference, settings, signing out. */
export function AppFoot() {
  const path = usePathname();
  const links: [string, string][] = [
    ["/how", "How it works"],
    ["/reference", "Grammar & reference"],
    ["/settings", "Settings"],
  ];
  return (
    <nav className="foot" aria-label="More">
      {links.map(([href, label]) => (
        <Link key={href} href={href} aria-current={isCurrent(path, href) ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </nav>
  );
}
