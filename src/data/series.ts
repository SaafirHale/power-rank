/**
 * Seed data. Names and forms only: no artwork, no descriptions copied from
 * anywhere. To add a series, append to SERIES and add a characters file entry;
 * the next database start-up (or `npm run seed`) inserts anything new.
 *
 * `form` is set where a character's power changes enough between arcs or
 * transformations that voters would argue about which version they mean, or
 * where the best-known alias is what people search for (Whitebeard, Akainu).
 */

export type SeedSeries = {
  slug: string;
  name: string;
  /** Accent colour for cards and board headers. */
  color: string;
};

export type SeedCharacter = {
  name: string;
  form?: string;
};

export const SERIES: SeedSeries[] = [
  { slug: "hxh", name: "Hunter x Hunter", color: "#2f9e44" },
  { slug: "naruto", name: "Naruto", color: "#e8590c" },
  { slug: "jjk", name: "Jujutsu Kaisen", color: "#7048e8" },
  { slug: "hells-paradise", name: "Hell's Paradise", color: "#d6336c" },
  { slug: "one-piece", name: "One Piece", color: "#1c7ed6" },
];

export const CHARACTERS: Record<string, SeedCharacter[]> = {
  hxh: [
    { name: "Gon Freecss" },
    { name: "Gon Freecss", form: "adult" },
    { name: "Killua Zoldyck" },
    { name: "Killua Zoldyck", form: "Godspeed" },
    { name: "Kurapika", form: "Emperor Time" },
    { name: "Leorio Paradinight" },
    { name: "Hisoka Morow" },
    { name: "Chrollo Lucilfer" },
    { name: "Meruem" },
    { name: "Isaac Netero" },
    { name: "Neferpitou" },
    { name: "Shaiapouf" },
    { name: "Menthuthuyoupi" },
    { name: "Feitan Portor" },
    { name: "Uvogin" },
    { name: "Phinks Magcub" },
    { name: "Nobunaga Hazama" },
    { name: "Silva Zoldyck" },
    { name: "Zeno Zoldyck" },
    { name: "Illumi Zoldyck" },
    { name: "Biscuit Krueger", form: "true form" },
    { name: "Kite" },
    { name: "Knuckle Bine" },
    { name: "Morel Mackernasey" },
    { name: "Ging Freecss" },
  ],
  naruto: [
    { name: "Naruto Uzumaki", form: "Part I" },
    { name: "Naruto Uzumaki", form: "Six Paths Sage Mode" },
    { name: "Sasuke Uchiha", form: "Part I" },
    { name: "Sasuke Uchiha", form: "Rinnegan" },
    { name: "Kakashi Hatake" },
    { name: "Kakashi Hatake", form: "double Mangekyō" },
    { name: "Might Guy", form: "Eight Gates" },
    { name: "Rock Lee" },
    { name: "Gaara" },
    { name: "Itachi Uchiha" },
    { name: "Shisui Uchiha" },
    { name: "Obito Uchiha", form: "Ten-Tails jinchūriki" },
    { name: "Madara Uchiha", form: "Edo Tensei" },
    { name: "Madara Uchiha", form: "Ten-Tails jinchūriki" },
    { name: "Hashirama Senju" },
    { name: "Tobirama Senju" },
    { name: "Hiruzen Sarutobi" },
    { name: "Minato Namikaze" },
    { name: "Jiraiya" },
    { name: "Tsunade" },
    { name: "Orochimaru" },
    { name: "Nagato", form: "Pain" },
    { name: "Kisame Hoshigaki" },
    { name: "Killer B" },
    { name: "Kaguya Ōtsutsuki" },
  ],
  jjk: [
    { name: "Satoru Gojo" },
    { name: "Ryomen Sukuna", form: "in Yuji, Shibuya" },
    { name: "Ryomen Sukuna", form: "Heian form" },
    { name: "Yuji Itadori" },
    { name: "Megumi Fushiguro" },
    { name: "Nobara Kugisaki" },
    { name: "Yuta Okkotsu" },
    { name: "Maki Zen'in", form: "awakened" },
    { name: "Toji Fushiguro" },
    { name: "Suguru Geto" },
    { name: "Kenjaku" },
    { name: "Mahito" },
    { name: "Jogo" },
    { name: "Hanami" },
    { name: "Choso" },
    { name: "Aoi Todo" },
    { name: "Kento Nanami" },
    { name: "Yuki Tsukumo" },
    { name: "Hiromi Higuruma" },
    { name: "Hajime Kashimo" },
    { name: "Kinji Hakari" },
    { name: "Naoya Zen'in" },
    { name: "Uraume" },
    { name: "Mahoraga" },
  ],
  "hells-paradise": [
    { name: "Gabimaru" },
    { name: "Yamada Asaemon Sagiri" },
    { name: "Yuzuriha" },
    { name: "Aza Chobe" },
    { name: "Yamada Asaemon Toma" },
    { name: "Yamada Asaemon Shion" },
    { name: "Yamada Asaemon Tenza" },
    { name: "Nurugai" },
    { name: "Tamiya Gantetsusai" },
    { name: "Yamada Asaemon Senta" },
    { name: "Yamada Asaemon Fuchi" },
    { name: "Mei" },
    { name: "Rien" },
    { name: "Zhu Jin" },
    { name: "Tao Fa" },
    { name: "Ju Fa" },
    { name: "Mu Dan" },
    { name: "Lan Ban" },
    { name: "Gui Fa" },
  ],
  "one-piece": [
    { name: "Monkey D. Luffy", form: "pre-timeskip" },
    { name: "Monkey D. Luffy", form: "Gear 5" },
    { name: "Roronoa Zoro", form: "Wano" },
    { name: "Sanji", form: "Ifrit Jambe" },
    { name: "Portgas D. Ace" },
    { name: "Sabo" },
    { name: "Trafalgar Law" },
    { name: "Eustass Kid" },
    { name: "Boa Hancock" },
    { name: "Crocodile" },
    { name: "Donquixote Doflamingo" },
    { name: "Charlotte Katakuri" },
    { name: "King" },
    { name: "Marco" },
    { name: "Edward Newgate", form: "Whitebeard" },
    { name: "Kaido" },
    { name: "Charlotte Linlin", form: "Big Mom" },
    { name: "Shanks" },
    { name: "Marshall D. Teach", form: "Blackbeard" },
    { name: "Gol D. Roger" },
    { name: "Silvers Rayleigh" },
    { name: "Dracule Mihawk" },
    { name: "Monkey D. Garp" },
    { name: "Sakazuki", form: "Akainu" },
    { name: "Kuzan", form: "Aokiji" },
    { name: "Borsalino", form: "Kizaru" },
  ],
};

/** Stable URL-safe id for a seed character, e.g. "hxh-gon-freecss-adult". */
export function characterSlug(series: string, c: SeedCharacter): string {
  const base = `${series} ${c.name} ${c.form ?? ""}`;
  return base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
