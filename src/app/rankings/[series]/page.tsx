import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Board, BoardTabs, FitMeta } from "@/components/board";
import { getDb } from "@/lib/db";
import { getBoard, listSeries } from "@/lib/service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ series: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series: slug } = await params;
  const s = (await listSeries(await getDb())).find((x) => x.slug === slug);
  return { title: s ? `${s.name} rankings` : "Rankings" };
}

export default async function SeriesRankingsPage({ params }: Props) {
  const { series: slug } = await params;
  const db = await getDb();
  const series = await listSeries(db);
  const s = series.find((x) => x.slug === slug);
  if (!s) notFound();
  const board = await getBoard(db, s.slug);
  return (
    <>
      <h1>{s.name} rankings</h1>
      <p className="lede">
        Ratings come from the same fit as the cross-series board, filtered to {s.name}, so votes against characters
        from other series count here too.
      </p>
      <BoardTabs series={series} active={s.slug} />
      <FitMeta fittedAt={board.fittedAt} nVotes={board.nVotes} />
      <Board ranked={board.ranked} provisional={board.provisional} showSeries={false} />
    </>
  );
}
