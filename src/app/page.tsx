import { Arena } from "@/components/arena";
import { getDb } from "@/lib/db";
import { listSeries } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function VotePage() {
  const series = await listSeries(await getDb());
  return (
    <>
      <h1>Who wins?</h1>
      <p className="lede">
        Two characters, one fight, no draws. Pick the winner and the rankings update from every vote cast. Matchups are
        chosen where your vote teaches the model the most.
      </p>
      <Arena series={series} />
    </>
  );
}
