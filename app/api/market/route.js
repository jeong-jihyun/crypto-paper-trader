// 원화마켓 전체 시세 (업비트 우선, 실패 시 빗썸)
export const dynamic = "force-dynamic";
let namesCache = { at: 0, map: null };

async function j(url) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
async function upbit() {
  if (!namesCache.map || Date.now() - namesCache.at > 3600_000) {
    const all = await j("https://api.upbit.com/v1/market/all?is_details=false");
    const map = {};
    for (const x of all) if (x.market.startsWith("KRW-")) map[x.market] = x.korean_name;
    namesCache = { at: Date.now(), map };
  }
  const markets = Object.keys(namesCache.map);
  const t = await j("https://api.upbit.com/v1/ticker?markets=" + markets.join(","));
  const coins = t.map((x) => ({
    sym: x.market.slice(4), name: namesCache.map[x.market] || x.market.slice(4),
    price: x.trade_price, prev: x.prev_closing_price, change: x.signed_change_rate * 100,
    vol: x.acc_trade_price_24h,
  }));
  return { source: "업비트", coins };
}
const KO = { BTC: "비트코인", ETH: "이더리움", XRP: "리플", SOL: "솔라나", DOGE: "도지코인", ADA: "에이다", TRX: "트론", LINK: "체인링크", AVAX: "아발란체", DOT: "폴카닷", BCH: "비트코인캐시", ETC: "이더리움클래식" };
async function bithumb() {
  const t = await j("https://api.bithumb.com/public/ticker/ALL_KRW");
  const coins = [];
  for (const [sym, x] of Object.entries(t.data)) {
    if (sym === "date" || !x.closing_price) continue;
    const price = Number(x.closing_price), prev = Number(x.prev_closing_price);
    coins.push({ sym, name: KO[sym] || sym, price, prev, change: Number(x.fluctate_rate_24H), vol: Number(x.acc_trade_value_24H) });
  }
  return { source: "빗썸", coins };
}
export async function GET() {
  for (const f of [upbit, bithumb]) {
    try { const d = await f(); if (d.coins.length) return Response.json({ ok: true, ...d, at: Date.now() }); } catch {}
  }
  return Response.json({ ok: false }, { status: 502 });
}
