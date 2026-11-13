// 모의투자 엔진: 지정가/시장가, 호가 소진 체결, 미체결 관리, 평가 (화면과 분리)
export const FEE_RATE = 0.0005; // 0.05%
export const MIN_ORDER = 5000;
export const INIT_CHOICES = [1_000_000, 10_000_000, 100_000_000];

// 원화마켓 호가 단위 (업비트 기준 근사)
export function tickSize(p) {
  if (p >= 2e6) return 1000; if (p >= 1e6) return 500; if (p >= 5e5) return 100;
  if (p >= 1e5) return 50; if (p >= 1e4) return 10; if (p >= 1e3) return 5;
  if (p >= 100) return 1; if (p >= 10) return 0.1; if (p >= 1) return 0.01;
  if (p >= 0.1) return 0.001; return 0.0001;
}
const decs = (t) => (String(t).split(".")[1] || "").length;
export function snap(p, mode = "round") {
  const t = tickSize(p);
  return Number((Math[mode](p / t) * t).toFixed(decs(t)));
}
const r8 = (n) => Number(n.toFixed(8));
const r2 = (n) => Number(n.toFixed(2));

export const initialState = (init = 10_000_000) => ({
  init, cash: init, pos: {}, orders: [], realized: 0, history: [], watch: [],
  stats: { limitPlaced: 0, canceled: 0 },
});

export function locked(state) {
  let cash = 0; const qty = {};
  for (const o of state.orders) {
    if (o.side === "buy") cash += o.price * o.qty * (1 + FEE_RATE);
    else qty[o.sym] = (qty[o.sym] || 0) + o.qty;
  }
  return { cash, qty };
}
export const availCash = (s) => Math.max(0, s.cash - locked(s).cash);
export const availQty = (s, sym) => Math.max(0, (s.pos[sym]?.qty || 0) - (locked(s).qty[sym] || 0));

// 호가를 위에서부터 소진하며 체결 (시장가 미리보기·실행에 공용)
export function walkBuy(krw, asks, fallback) {
  let budget = krw / (1 + FEE_RATE), qty = 0, spent = 0;
  for (const { price, size } of asks) {
    if (budget <= 0) break;
    const take = Math.min(budget / price, size);
    qty += take; spent += take * price; budget -= take * price;
  }
  const lastPx = asks.length ? asks[asks.length - 1].price : fallback;
  if (budget > 1 && lastPx > 0) { qty += budget / lastPx; spent += budget; }
  return { qty: r8(qty), avg: qty > 0 ? spent / qty : 0, spent };
}
export function walkSell(qtyWant, bids, fallback) {
  let left = qtyWant, got = 0;
  for (const { price, size } of bids) {
    if (left <= 0) break;
    const take = Math.min(left, size);
    got += take * price; left -= take;
  }
  const lastPx = bids.length ? bids[bids.length - 1].price : fallback;
  if (left > 0 && lastPx > 0) got += left * lastPx;
  return { avg: qtyWant > 0 ? got / qtyWant : 0, gross: got };
}

function fill(state, sym, side, price, qty, kind) {
  const p = state.pos[sym] || { qty: 0, avg: 0 };
  const gross = price * qty, fee = gross * FEE_RATE;
  const pos = { ...state.pos };
  let cash = state.cash, realized = state.realized, profit;
  if (side === "buy") {
    const nq = r8(p.qty + qty);
    pos[sym] = { qty: nq, avg: (p.avg * p.qty + price * qty) / nq };
    cash = Math.max(0, r2(cash - gross - fee));
  } else {
    profit = gross - fee - p.avg * qty;
    realized += profit;
    cash = r2(cash + gross - fee);
    const left = r8(p.qty - qty);
    if (left > 1e-9) pos[sym] = { qty: left, avg: p.avg }; else delete pos[sym];
  }
  const rec = { t: Date.now(), sym, side, kind, price, qty, total: gross, fee, profit };
  return { ...state, cash, pos, realized, history: [rec, ...state.history].slice(0, 300) };
}

export function marketBuy(state, sym, krw, asks, fallback) {
  if (!(krw >= MIN_ORDER)) return { error: "최소 주문금액은 5,000원이에요." };
  if (krw > availCash(state) + 0.5) return { error: "주문가능 금액이 부족해요." };
  const w = walkBuy(krw, asks, fallback);
  if (!(w.qty > 0)) return { error: "시세를 아직 못 받았어요. 잠시 후 다시 시도해 주세요." };
  return { state: fill(state, sym, "buy", w.avg, w.qty, "market") };
}
export function marketSell(state, sym, qty, bids, fallback) {
  qty = r8(qty);
  if (!(qty > 0)) return { error: "수량을 입력해 주세요." };
  if (qty > availQty(state, sym) + 1e-9) return { error: "주문가능 수량이 부족해요." };
  const w = walkSell(qty, bids, fallback);
  if (!(w.avg > 0)) return { error: "시세를 아직 못 받았어요. 잠시 후 다시 시도해 주세요." };
  if (w.gross < MIN_ORDER) return { error: "최소 주문금액은 5,000원이에요." };
  return { state: fill(state, sym, "sell", w.avg, qty, "market") };
}
export function placeLimit(state, sym, side, price, qty) {
  qty = r8(qty);
  if (!(price > 0) || !(qty > 0)) return { error: "가격과 수량을 입력해 주세요." };
  if (Math.abs(snap(price) - price) > 1e-9) return { error: `이 가격대의 호가 단위는 ${tickSize(price)}원이에요.` };
  if (price * qty < MIN_ORDER) return { error: "최소 주문금액은 5,000원이에요." };
  if (side === "buy" && price * qty * (1 + FEE_RATE) > availCash(state) + 0.5) return { error: "주문가능 금액이 부족해요." };
  if (side === "sell" && qty > availQty(state, sym) + 1e-9) return { error: "주문가능 수량이 부족해요." };
  const o = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), t: Date.now(), sym, side, price, qty };
  return { state: { ...state, orders: [o, ...state.orders], stats: { ...state.stats, limitPlaced: state.stats.limitPlaced + 1 } } };
}
export function cancelOrder(state, id) {
  return { ...state, orders: state.orders.filter((o) => o.id !== id), stats: { ...state.stats, canceled: state.stats.canceled + 1 } };
}
// 현재가가 지정가에 닿으면 체결 (체결가는 유리한 쪽)
export function matchOrders(state, prices) {
  let s = state; const filled = [];
  for (const o of [...state.orders].reverse()) {
    const last = prices[o.sym]; if (!(last > 0)) continue;
    const hit = o.side === "buy" ? last <= o.price : last >= o.price;
    if (!hit) continue;
    const px = o.side === "buy" ? Math.min(o.price, last) : Math.max(o.price, last);
    s = { ...s, orders: s.orders.filter((x) => x.id !== o.id) };
    s = fill(s, o.sym, o.side, px, o.qty, "limit");
    filled.push({ ...o, fillPrice: px });
  }
  return { state: s, filled };
}
export function evaluate(state, prices) {
  let value = 0, cost = 0;
  for (const [s, p] of Object.entries(state.pos)) { value += p.qty * (prices[s] || p.avg); cost += p.qty * p.avg; }
  const total = state.cash + value;
  return { value, cost, unreal: value - cost, unrealRate: cost > 0 ? ((value - cost) / cost) * 100 : 0, total, pnl: total - state.init, pnlRate: ((total - state.init) / state.init) * 100 };
}
