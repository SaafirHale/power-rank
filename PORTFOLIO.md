# Portfolio entry (draft)

A draft in the shape of the `Project` type in `saafirhale-site/src/content/projects.ts`. Every claim can be checked
against this repo or the live site.

```ts
  {
    slug: "power-rank",
    category: "data",
    title: "Power Rank",
    blurb:
      "Crowd-voted anime power scaling: head-to-head votes fitted with a Bradley-Terry model, error bars on every rating, and matchmaking that serves the fights the model most needs settled.",
    body: [
      "Power Rank asks one question over and over: in a fight between these two characters, who wins? It starts with 119 characters from Hunter x Hunter, Naruto, Jujutsu Kaisen, Hell's Paradise and One Piece, with forms split out where they change the answer (Gon and adult Gon, Luffy pre-timeskip and in Gear 5). Every vote feeds one cross-series ranking, plus a board per series and a page of the matchups the crowd cannot settle.",
      "The ranking is a Bradley-Terry model fitted by the MM algorithm over all votes at once, so the order votes arrive in does not matter and beating a strong character counts for more than beating a weak one. Each character also plays two virtual games against an average anchor, a weak prior that keeps a 3–0 newcomer near the middle instead of at infinity. Plain MM crawls along the one direction where every strength scales together, so each sweep also solves that direction exactly: on a 20,000-vote synthetic test, plain MM had not converged after 10,000 sweeps, and with the extra step it converges in 212.",
      "Every rating carries a 95% interval from the inverse Fisher information, taken relative to the field average so the arbitrary zero point does not inflate it. A character needs 15 real matchups before it is ranked at all. Tests check that the fit recovers a known 30-player ordering from synthetic votes (Spearman above 0.97) and that the 95% intervals cover the true strengths at close to their stated rate (97% across ten synthetic datasets). A live Elo moves on every vote so voters see an immediate result, but the boards rank by the full fit.",
      "Matchmaking weights each pair by p(1−p) times the two ratings' summed variance, so even fights between characters the model is unsure about come up most, with one draw in ten fully random so no pair is starved. The controversial page ranks pairs by the Wilson lower bound of the losing side's share, which rewards a close split and a large sample together.",
      "There are no accounts. A signed cookie and a unique index allow one vote per pair per visitor per day, and each matchup is a signed, expiring token tied to that cookie, so scripts cannot pick their own fights. Rate limits key on an HMAC of the client address under a salt that rotates every UTC day, so no IP address is ever stored. Locally the app runs on PGlite, Postgres compiled to WASM, so it needs no database install or account, and 25 Vitest tests cover the model, the matchmaking and the abuse limits against a real Postgres engine.",
    ],
    stack: ["Next.js", "TypeScript", "Postgres (Neon)", "PGlite", "Vitest", "Vercel"],
    links: [{ label: "power-rank.vercel.app", href: "https://power-rank.vercel.app" }],
    status: "live",
  },
```

## Before publishing

- The body describes mechanics only. Once the site has real votes, a sentence on real usage (vote count, most
  controversial fight) can go in, taken from the live boards rather than the simulated dev data.
