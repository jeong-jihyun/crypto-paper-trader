// 한 코인의 호가 + 캔들 (차트)
export const dynamic = "force-dynamic";
async function j(url) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
const PATH = { "1": "minutes/1", "5": "minutes/5", "15": "minutes/15", "60": "minutes/60", "240": "minutes/240", d: "days", w: "weeks" };
export async function GET(req) {
  const u = new URL(req.url);
  const sym = (u.searchParams.get("sym") || "BTC").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const unit = PATH[u.searchParams.get("unit")] ? u.searchParams.get("unit") : "5";
  const m = "KRW-" + sym;
  try {
    const [ob, cd] = await Promise.all([
      j("https://api.upbit.com/v1/orderbook?markets=" + m),
      j(`https://api.upbit.com/v1/candles/${PATH[unit]}?market=${m}&count=80`),
    ]);
    const units = ob[0].orderbook_units;
    return Response.json({
      ok: true,
      asks: units.map((x) => ({ price: x.ask_price, size: x.ask_size })), // 낮은 가격 → 높은 가격
      bids: units.map((x) => ({ price: x.bid_price, size: x.bid_size })), // 높은 가격 → 낮은 가격
      candles: cd.map((x) => ({ t: x.timestamp, o: x.opening_price, h: x.high_price, l: x.low_price, c: x.trade_price, v: x.candle_acc_trade_volume })).reverse(),
    });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
