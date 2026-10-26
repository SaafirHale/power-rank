import type { Metadata } from "next";
import { LIMITS } from "@/lib/abuse";
import { CONTROVERSIAL_MIN_VOTES, MIN_GAMES } from "@/lib/service";

export const metadata: Metadata = { title: "Method" };

export default function AboutPage() {
  return (
    <article className="prose">
      <h1>How the rankings work</h1>
      <p className="lede">
        Every vote is one data point: “in a fight between these two, this one wins.” The site turns those data points
        into a ranking with a statistical model, and picks the next matchup to be the one the model most needs answered.
      </p>

      <h2>The ranking: Bradley-Terry</h2>
      <p>
        Each character gets a hidden strength θ. The model says the chance that A beats B depends only on the gap
        between them:
      </p>
      <p className="formula">P(A beats B) = 1 / (1 + e^−(θ_A − θ_B))</p>
      <p>
        The strengths are fitted to all votes at once by maximum likelihood, using the MM algorithm from David Hunter’s
        2004 paper: each character’s strength is repeatedly updated to its wins divided by the sum, over its opponents,
        of games played ÷ (its strength + the opponent’s strength), until nothing moves by more than one part in a
        billion. Because every vote is used together, the order votes arrive in does not matter, and beating a strong
        character counts for more than beating a weak one.
      </p>
      <p>
        Strengths are shown on a familiar Elo-like scale: 1500 is average and every 400 points is 10-to-1 odds. A 1900
        is expected to beat a 1500 about 91% of the time.
      </p>

      <h2>Uncertainty</h2>
      <p>
        A pure maximum-likelihood fit gives an unbeaten character infinite strength. To stop that, every character also
        plays two imaginary games against an average opponent, winning one and losing one. This acts as a weak prior: it
        barely matters after a hundred real votes, but it keeps a character with three wins near the middle until the
        evidence builds up.
      </p>
      <p>
        Each rating comes with a 95% interval, computed from the curvature of the likelihood (the inverse of the Fisher
        information matrix). The interval narrows as a character collects votes, especially close ones. On the boards
        it is drawn as a bar around each rating, and two characters whose bars overlap heavily are not clearly
        separated yet.
      </p>
      <p>
        On top of that, a character needs <strong>{MIN_GAMES} real matchups</strong> before it gets a rank at all.
        Until then it is listed under “Not ranked yet” with its progress.
      </p>

      <h2>Live Elo</h2>
      <p>
        After you vote you see each character’s live Elo move. That is classic Elo, updated one vote at a time (32-point
        steps for a character’s first 30 matchups, 16 after). It is there because watching a number move is fun. It is
        order-dependent and jumpy, so the boards rank by the Bradley-Terry fit, which is recomputed from all votes at
        most every ten minutes when there are new votes, and once a day by a scheduled job.
      </p>

      <h2>Choosing matchups</h2>
      <p>Random pairs waste votes: nobody learns anything from a top-five character against a bottom-five one. Every possible pair gets a weight:</p>
      <p className="formula">weight = p(1 − p) × (σ_A² + σ_B²)</p>
      <p>
        where p is the model’s current chance that A wins and σ is each strength’s standard error. p(1 − p) is largest
        for an even fight and near zero for a foregone conclusion; the σ² term favours characters the model is still
        unsure about, which is why new characters show up often until they have settled. Pairs are drawn in proportion
        to the weight squared, so the most informative fights dominate without being the only ones.
      </p>
      <p>
        One draw in ten ignores the weights and picks a pair uniformly at random, so every pair keeps getting some
        data and the model cannot talk itself into a blind spot. The two characters are shown in random left/right
        order, so screen position cannot bias the result, and you are never shown a pair you have already voted on
        today. The series buttons limit the draw to one series; “All series” includes cross-series fights, which is
        what puts every series on one scale.
      </p>

      <h2>Series boards</h2>
      <p>
        There is one fit for everything. A series board is the cross-series fit filtered to that series, so a Jujutsu
        Kaisen character’s rating includes its fights against One Piece characters too.
      </p>

      <h2>Controversial matchups</h2>
      <p>
        The controversial page lists pairs with at least {CONTROVERSIAL_MIN_VOTES} votes where the losing side still
        took 30% or more. They are ranked by the lower end of the 95% Wilson interval for the losing side’s share: the
        share we can be confident the underdog really gets. That one number rewards a split close to 50/50 and a large
        number of votes at the same time, so 100–100 outranks 5–5, which outranks 7–3.
      </p>

      <h2>Fair voting, without accounts</h2>
      <ul>
        <li>
          Your browser gets a random id in a signed cookie. The database stores only a keyed hash of it, never the id
          itself, and allows one vote per pair per id per UTC day.
        </li>
        <li>
          Every matchup is issued as a signed token tied to your cookie and valid for 30 minutes, so a script cannot
          vote on pairs of its choosing.
        </li>
        <li>
          Rate limits ({LIMITS.networkPerMinute} votes a minute per network, {LIMITS.visitorPerMinute} per browser, and{" "}
          {LIMITS.networkPairPerDay} votes on the same pair per network per day) use a hashed key. Your IP address is
          combined with a secret salt that changes every UTC day and hashed, and only the hash is stored. Yesterday’s
          hashes cannot be linked to today’s, and none can be turned back into an address. Counters older than two days
          are deleted.
        </li>
      </ul>

      <h2>No artwork, on purpose</h2>
      <p>
        Character art belongs to its creators and publishers, so the cards are text with a series colour and initials.
        Character names are used only to say who is who.
      </p>
    </article>
  );
}
