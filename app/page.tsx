import { Assembly } from "@/components/buy/Assembly";
import { SiteFrame } from "@/components/site/SiteFrame";

export default function HomePage() {
  return (
    <SiteFrame>
      <div className="relative overflow-hidden bg-primary-deep text-white">
        <div className="hero-wash" aria-hidden="true" />
        <main id="main" className="relative">
          <div className="mx-auto grid w-[min(68rem,calc(100%-2rem))] items-center gap-10 py-10 pb-16 md:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-xl">
              <p className="text-xs font-bold tracking-[0.14em] text-accent uppercase">
                From your own wallet
              </p>
              <h1 className="mt-6 max-w-[11ch] text-[clamp(3rem,7vw,5.4rem)] leading-none font-bold tracking-tight">
                Buy traffic for a validator.
              </h1>
              <p className="mt-6 max-w-md text-lg text-hero-muted">
                Connect, choose a validator, and confirm.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <a
                  href="/buy"
                  className="inline-flex h-12 items-center rounded-full bg-accent px-5 text-sm font-bold tracking-tight text-white no-underline hover:bg-accent-strong"
                >
                  Open app
                </a>
                <a
                  href="#how"
                  className="inline-flex h-12 items-center rounded-full border border-white/30 px-5 text-sm font-bold tracking-tight text-white no-underline hover:border-white"
                >
                  How it works
                </a>
              </div>
            </div>
            <Assembly mode="demo" frame="hero" />
          </div>
        </main>
      </div>
      <section id="how" className="py-16">
        <div className="mx-auto w-[min(68rem,calc(100%-2rem))]">
          <h2 className="text-[clamp(2rem,4vw,3rem)] leading-tight font-bold tracking-tight text-primary">
            Three steps.
          </h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {[
              ["01", "Connect", "Connect your wallet."],
              ["02", "Choose", "Pick the validator and the traffic you want to buy."],
              ["03", "Confirm", "Confirm the purchase. CC spent on traffic does not come back."],
            ].map(([index, title, body]) => (
              <article key={index} className="rounded-lg border border-line bg-surface p-4 bar-shadow">
                <p className="text-xs font-bold tracking-[0.14em] text-accent-strong uppercase">
                  {index}
                </p>
                <h3 className="mt-3 text-xl font-bold tracking-tight text-primary">{title}</h3>
                <p className="mt-3 text-sm text-ink-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
