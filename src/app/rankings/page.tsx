import type { Metadata } from "next";
import { Board, BoardTabs, FitMeta } from "@/components/board";
import { getDb } from "@/lib/db";
import { getBoard, listSeries } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cross-series rankings" };

export default async function RankingsPage() {
  const db = await getDb();
  const [series, board] = await Promise.all([listSeries(db), getBoard(db, null)]);
  return (
    <>
      <h1>Cross-series rankings</h1>
      <p className="lede">
        Every character on one scale. Cross-series votes link the series together, so a Hunter x Hunter rating and a
        One Piece rating mean the same thing.
      </p>
      <BoardTabs series={series} active={null} />
      <FitMeta fittedAt={board.fittedAt} nVotes={board.nVotes} />
      <Board ranked={board.ranked} provisional={board.provisional} showSeries />
    </>
  );
}
