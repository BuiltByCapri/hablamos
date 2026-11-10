import Link from "next/link";

/** The choice at the top of Practice: Cards or Quiz. */
export function PracticeTabs({ current }: { current: "cards" | "quiz" }) {
  const tab = (key: "cards" | "quiz", href: string, label: string) => (
    <li>
      {current === key ? (
        <span aria-current="page">{label}</span>
      ) : (
        <Link href={href}>{label}</Link>
      )}
    </li>
  );
  return (
    <nav className="tabs" aria-label="Practice">
      <ul>
        {tab("cards", "/flashcards", "Cards")}
        {tab("quiz", "/quiz", "Quiz")}
      </ul>
    </nav>
  );
}
