import Link from "next/link";

const links = [
  ["Imprint", "/imprint"],
  ["Terms", "/terms"],
  ["Privacy", "/privacy"],
  ["FAQ", "/faq"],
] as const;

export function SiteFooter({ contained = false }: { contained?: boolean }) {
  const wrap = contained
    ? "flex flex-wrap items-center justify-between gap-3"
    : "mx-auto flex w-[min(68rem,calc(100%-2rem))] flex-wrap items-center justify-between gap-3";
  return (
    <footer className="border-t border-line py-5 text-xs text-ink-muted">
      <div className={wrap}>
        <p>Open source reference</p>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-3">
            {links.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-primary no-underline hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
