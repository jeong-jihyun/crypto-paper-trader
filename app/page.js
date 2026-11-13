"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as T from "../lib/trade.mjs";
const { FEE_RATE, MIN_ORDER, INIT_CHOICES, tickSize, snap, availCash, availQty, walkBuy, walkSell, evaluate } = T;

const KEY = "coin-paper-v2";
const decs = (t) => (String(t).split(".")[1] || "").length;
const fmtP = (p) => { if (p == null) return "-"; const d = decs(tickSize(p)); return p.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const fmtD = (price, d) => { const t = decs(tickSize(price)); return (d > 0 ? "+" : "") + d.toLocaleString("ko-KR", { minimumFractionDigits: t, maximumFractionDigits: t }); };
const fmtQ = (n) => (n == null ? "-" : Number(n.toFixed(8)).toString());
const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
const pct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const cls = (n) => (n > 0.00001 ? "up" : n < -0.00001 ? "down" : "flat");
const fl8 = (n) => Math.floor(n * 1e8) / 1e8;
const hhmm = (t) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/* ───────── 캔들 차트 ───────── */
function Candles({ data, avg }) {
  if (!data || data.length < 2) return <div className="muted" style={{ padding: 40, textAlign: "center" }}>차트 불러오는 중…</div>;
  const d = data.slice(-60), W = 360, H = 200, VH = 40;
  let hi = Math.max(...d.map((x) => x.h)), lo = Math.min(...d.map((x) => x.l));
  if (avg > 0) { hi = Math.max(hi, avg); lo = Math.min(lo, avg); }
  const pad = (hi - lo) * 0.05 || 1; hi += pad; lo -= pad;
  const y = (v) => ((hi - v) / (hi - lo)) * H;
  const step = W / d.length, bw = Math.max(1.5, step * 0.6);
  const vmax = Math.max(...d.map((x) => x.v)) || 1;
  const last = d[d.length - 1].c;
  return (
    <svg viewBox={`0 0 ${W} ${H + VH + 14}`} width="100%" style={{ display: "block", background: "#fff" }}>
      {[0.25, 0.5, 0.75].map((r) => <line key={r} x1="0" x2={W} y1={H * r} y2={H * r} stroke="#f0f2f5" />)}
      {d.map((x, i) => {
        const up = x.c >= x.o, col = up ? "#d24f45" : "#1261c4", cx = i * step + step / 2;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(x.h)} y2={y(x.l)} stroke={col} />
            <rect x={cx - bw / 2} y={Math.min(y(x.o), y(x.c))} width={bw} height={Math.max(1, Math.abs(y(x.o) - y(x.c)))} fill={col} />
            <rect x={cx - bw / 2} y={H + 10 + VH - (x.v / vmax) * VH} width={bw} height={(x.v / vmax) * VH} fill={col} opacity=".45" />
          </g>
        );
      })}
      <line x1="0" x2={W} y1={y(last)} y2={y(last)} stroke="#555" strokeDasharray="3 3" strokeWidth=".7" />
      <text x={W - 2} y={y(last) - 2} fontSize="9" textAnchor="end" fill="#555">{fmtP(last)}</text>
      {avg > 0 && <><line x1="0" x2={W} y1={y(avg)} y2={y(avg)} stroke="#2e9e5b" strokeDasharray="5 3" strokeWidth=".9" /><text x="2" y={y(avg) - 2} fontSize="9" fill="#2e9e5b">내 평균 {fmtP(avg)}</text></>}
      <text x="2" y="9" fontSize="9" fill="#8a93a6">{fmtP(hi - pad)}</text>
      <text x="2" y={H - 2} fontSize="9" fill="#8a93a6">{fmtP(lo + pad)}</text>
    </svg>
  );
}

/* ───────── 호가창 ───────── */
function Orderbook({ data, prev, onPick }) {
  if (!data?.asks?.length) return <div className="muted" style={{ padding: 16 }}>호가 불러오는 중…</div>;
  const asks = data.asks.slice(0, 8).reverse(), bids = data.bids.slice(0, 8);
  const mx = Math.max(...asks.map((x) => x.size), ...bids.map((x) => x.size)) || 1;
  const row = (x, k, side) => (
    <div key={side + k} className={"obrow " + side} onClick={() => onPick(x.price)}>
      <div className="bar" style={{ width: (x.size / mx) * 100 + "%" }} />
      <span style={{ textAlign: "right", color: "#555" }}>{x.size.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}</span>
      <span className={cls(x.price - prev)} style={{ fontWeight: 600 }}>
        {fmtP(x.price)}<span style={{ fontSize: 10, marginLeft: 3 }}>{prev ? pct((x.price / prev - 1) * 100) : ""}</span>
      </span>
    </div>
  );
  return <div>{asks.map((x, i) => row(x, i, "ask"))}{bids.map((x, i) => row(x, i, "bid"))}</div>;
}

/* ───────── 코인 상세 (차트 + 호가 + 주문) ───────── */
function Detail({ coin, st, setSt, notify, onBack, onToggleWatch }) {
  const sym = coin.sym;
  const [sub, setSub] = useState("order");
  const [unit, setUnit] = useState("5");
  const [data, setData] = useState(null);
  const [side, setSide] = useState("buy");
  const [kind, setKind] = useState("limit");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { setPrice(String(snap(coin.price))); setQty(""); setTotal(""); setErr(null); }, [sym]);
  useEffect(() => {
    let stop = false;
    const go = async () => {
      try { const r = await fetch(`/api/coin?sym=${sym}&unit=${unit}`, { cache: "no-store" }); const d = await r.json(); if (!stop && d.ok) setData(d); } catch {}
    };
    setData((d) => (d && d.sym === sym ? d : null)); go();
    const id = setInterval(go, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [sym, unit]);

  const asks = data?.asks || [], bids = data?.bids || [];
  const p = Number(price) || 0, q = Number(qty) || 0, tot = Number(total) || 0;
  const cash = availCash(st), have = availQty(st, sym), pos = st.pos[sym];
  const tk = tickSize(p || coin.price);
  const myOrders = st.orders.filter((o) => o.sym === sym);

  const preview = useMemo(() => {
    if (kind !== "market") return null;
    if (side === "buy" && tot > 0) return walkBuy(tot, asks, coin.price);
    if (side === "sell" && q > 0) { const w = walkSell(q, bids, coin.price); return { avg: w.avg, gross: w.gross }; }
    return null;
  }, [kind, side, tot, q, data, coin.price]);

  function setPercent(x) {
    setErr(null);
    if (kind === "limit") {
      if (side === "buy") setQty(p > 0 ? String(fl8((cash * x / 100) / (p * (1 + FEE_RATE)))) : "");
      else setQty(String(fl8(have * x / 100)));
    } else {
      if (side === "buy") setTotal(String(Math.floor(cash * x / 100)));
      else setQty(String(fl8(have * x / 100)));
    }
  }
  function step(dir) { const n = snap((p || coin.price) + dir * tk); if (n > 0) setPrice(String(n)); }
  function pick(px) { setKind("limit"); setPrice(String(px)); setSub("order"); }

  function submit() {
    setErr(null);
    let desc;
    if (kind === "limit") {
      const t = T.placeLimit(st, sym, side, p, q); if (t.error) return setErr(t.error);
      desc = [["종류", "지정가 " + (side === "buy" ? "매수" : "매도")], ["가격", fmtP(p) + "원"], ["수량", fmtQ(q) + " " + sym], ["주문총액", won(p * q)], ["예상 수수료", won(p * q * FEE_RATE)]];
    } else if (side === "buy") {
      const t = T.marketBuy(st, sym, tot, asks, coin.price); if (t.error) return setErr(t.error);
      desc = [["종류", "시장가 매수"], ["주문총액", won(tot)], ["예상 평균체결가", fmtP(preview?.avg || coin.price) + "원"], ["예상 수량", fmtQ(preview?.qty || 0) + " " + sym], ["수수료", "약 " + won(tot * FEE_RATE / (1 + FEE_RATE))]];
    } else {
      const t = T.marketSell(st, sym, q, bids, coin.price); if (t.error) return setErr(t.error);
      desc = [["종류", "시장가 매도"], ["수량", fmtQ(q) + " " + sym], ["예상 평균체결가", fmtP(preview?.avg || coin.price) + "원"], ["예상 수령액", won((preview?.gross || 0) * (1 - FEE_RATE))]];
    }
    setConfirm(desc);
  }
  function exec() {
    setConfirm(null);
    const r = kind === "limit" ? T.placeLimit(st, sym, side, p, q) : side === "buy" ? T.marketBuy(st, sym, tot, asks, coin.price) : T.marketSell(st, sym, q, bids, coin.price);
    if (r.error) return setErr(r.error);
    setSt(r.state); setQty(""); setTotal("");
    notify(kind === "limit" ? "주문이 접수됐어요 (미체결 · 투자내역에서 확인)" : (side === "buy" ? "매수" : "매도") + " 체결 완료!");
  }

  const bigGap = kind === "limit" && p > 0 && coin.price > 0 && Math.abs(p / coin.price - 1) > 0.05;
  const buying = side === "buy";

  return (
    <div className="app">
      <div className="top">
        <div className="row">
          <div style={{ display: "flex", alignItems: "center" }}>
            <button className="back" onClick={onBack}>‹</button>
            <div><div className="h1">{coin.name}</div><div className="muted">{sym}/KRW</div></div>
          </div>
          <button className={"star " + (st.watch.includes(sym) ? "on" : "")} style={{ fontSize: 22 }} onClick={() => onToggleWatch(sym)}>★</button>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
          <span className={"big " + cls(coin.change)}>{fmtP(coin.price)}</span>
          <span className={cls(coin.change)}>{pct(coin.change)} ({fmtD(coin.price, coin.price - coin.prev)})</span>
        </div>
      </div>
      <div className="seg">
        {[["order", "주문"], ["chart", "차트"]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}
      </div>

      {sub === "chart" && (
        <div>
          <div className="chips">
            {[["1", "1분"], ["5", "5분"], ["15", "15분"], ["60", "1시간"], ["240", "4시간"], ["d", "일"], ["w", "주"]].map(([k, l]) => (
              <button key={k} className={"chip " + (unit === k ? "on" : "")} onClick={() => setUnit(k)}>{l}</button>
            ))}
          </div>
          <Candles data={data?.candles} avg={pos?.avg} />
          <div className="card">
            <div className="muted">빨강=상승 · 파랑=하락 · 아래 막대=거래량{pos ? " · 초록 점선=내 평균 매수가" : ""}</div>
            {data?.candles?.length > 0 && <div className="row"><span className="muted">표시 구간 고가 / 저가</span><span>{fmtP(Math.max(...data.candles.slice(-60).map((x) => x.h)))} / {fmtP(Math.min(...data.candles.slice(-60).map((x) => x.l)))}</span></div>}
            <div className="row"><span className="muted">24시간 거래대금</span><span>{Math.round(coin.vol / 1e6).toLocaleString("ko-KR")}백만원</span></div>
          </div>
        </div>
      )}

      {sub === "order" && (
        <div>
          <div className="sidetabs">
            <button className={"buy " + (buying && side !== "hist" ? "on" : "")} onClick={() => { setSide("buy"); setErr(null); }}>매수</button>
            <button className={"sell " + (side === "sell" ? "on" : "")} onClick={() => { setSide("sell"); setErr(null); }}>매도</button>
            <button className={"hist " + (side === "hist" ? "on" : "")} onClick={() => setSide("hist")}>미체결{myOrders.length ? ` ${myOrders.length}` : ""}</button>
          </div>
          {side === "hist" ? (
            <div>
              {myOrders.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>이 코인의 미체결 주문이 없어요.</div>}
              {myOrders.map((o) => <OrderRow key={o.id} o={o} price={coin.price} onCancel={() => { setSt(T.cancelOrder(st, o.id)); notify("주문을 취소했어요"); }} />)}
            </div>
          ) : (
            <div className="ob">
              <div><Orderbook data={data} prev={coin.prev} onPick={pick} />
                <div className="muted" style={{ padding: 8 }}>호가를 누르면 가격이 입력돼요</div></div>
              <div className="form">
                <div className="kind">
                  <label><input type="radio" checked={kind === "limit"} onChange={() => { setKind("limit"); setErr(null); }} />지정가</label>
                  <label><input type="radio" checked={kind === "market"} onChange={() => { setKind("market"); setErr(null); }} />시장가</label>
                </div>
                <div className="lab">주문가능</div>
                <div style={{ fontWeight: 700 }}>{buying ? won(cash) : fmtQ(have) + " " + sym}</div>
                {kind === "limit" && (<>
                  <div className="lab">{buying ? "매수가격 (KRW)" : "매도가격 (KRW)"}</div>
                  <div className="field"><button onClick={() => step(-1)}>−</button><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /><button onClick={() => step(1)}>＋</button></div>
                  <div className="lab">주문수량 ({sym})</div>
                  <div className="field"><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /><span className="u">{sym}</span></div>
                </>)}
                {kind === "market" && buying && (<>
                  <div className="lab">주문총액 (KRW)</div>
                  <div className="field"><input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" /><span className="u">원</span></div>
                </>)}
                {kind === "market" && !buying && (<>
                  <div className="lab">주문수량 ({sym})</div>
                  <div className="field"><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /><span className="u">{sym}</span></div>
                </>)}
                <div className="pct">{[10, 25, 50, 100].map((x) => <button key={x} onClick={() => setPercent(x)}>{x === 100 ? "최대" : x + "%"}</button>)}</div>
                {kind === "limit" && <div className="row"><span className="lab">주문총액</span><b>{won(p * q)}</b></div>}
                {preview && <div className="muted">예상 평균체결가 {fmtP(preview.avg)}원{kind === "market" && buying ? ` · 약 ${fmtQ(preview.qty)} ${sym}` : ""}</div>}
                <div className="muted">수수료 {FEE_RATE * 100}% · 최소 {MIN_ORDER.toLocaleString()}원</div>
                {bigGap && <div className="tip">⚠️ 현재가와 5% 넘게 차이 나요. 이 가격은 오래 체결되지 않을 수 있어요.</div>}
                {kind === "market" && <div className="tip">시장가는 지금 호가대로 바로 체결돼요. 물량이 적은 코인은 예상보다 불리한 가격에 체결될 수 있어요.</div>}
                {err && <div className="err">{err}</div>}
                <button className={"go " + side} onClick={submit}>{buying ? "매수" : "매도"}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirm && (
        <div className="modal" onClick={() => setConfirm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="h1" style={{ marginBottom: 10 }}>{coin.name} 주문 확인</div>
            {confirm.map(([a, b]) => <div className="row" key={a}><span className="muted">{a}</span><b>{b}</b></div>)}
            <div className="btns">
              <button style={{ background: "#eef0f4" }} onClick={() => setConfirm(null)}>취소</button>
              <button style={{ background: buying ? "#d24f45" : "#1261c4", color: "#fff" }} onClick={exec}>{buying ? "매수" : "매도"} 확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderRow({ o, price, onCancel, name }) {
  return (
    <div className="ordcard">
      <div className="row">
        <span><span className={"pill " + o.side}>{o.side === "buy" ? "매수" : "매도"}</span><b>{name || o.sym}</b> <span className="muted">지정가</span></span>
        <button className="cancel" onClick={onCancel}>취소</button>
      </div>
      <div className="row"><span className="muted">주문가격</span><span>{fmtP(o.price)}원</span></div>
      <div className="row"><span className="muted">주문수량</span><span>{fmtQ(o.qty)} {o.sym}</span></div>
      <div className="row"><span className="muted">현재가</span><span className={cls(price - o.price)}>{fmtP(price)}원</span></div>
      <div className="muted">{hhmm(o.t)} 접수 · 가격이 닿으면 자동 체결 (앱을 켜 둔 동안)</div>
    </div>
  );
}

/* ───────── 거래소 탭 ───────── */
function MarketTab({ coins, st, setSt, open, missions }) {
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");
  const [sort, setSort] = useState({ k: "vol", dir: -1 });
  const [guideOpen, setGuideOpen] = useState(true);
  const done = missions.filter((m) => m.done).length;
  let list = coins;
  if (seg === "hold") list = list.filter((c) => st.pos[c.sym]);
  if (seg === "watch") list = list.filter((c) => st.watch.includes(c.sym));
  if (q.trim()) { const s = q.trim().toLowerCase(); list = list.filter((c) => c.name.toLowerCase().includes(s) || c.sym.toLowerCase().includes(s)); }
  list = [...list].sort((a, b) => (a[sort.k] - b[sort.k]) * sort.dir).slice(0, 120);
  const th = (k, l) => <span onClick={() => setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }))}>{l}{sort.k === k ? (sort.dir < 0 ? "▼" : "▲") : ""}</span>;
  const toggle = (sym) => setSt((s) => ({ ...s, watch: s.watch.includes(sym) ? s.watch.filter((x) => x !== sym) : [...s.watch, sym] }));
  return (
    <div>
      <div className="top"><div className="h1">거래소</div>
        <input className="search" placeholder="코인명 · 심볼 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!st.ui?.hideGuide && (
        <div className="card" style={{ background: "#f4f7ff" }}>
          <div className="row" onClick={() => setGuideOpen(!guideOpen)} style={{ cursor: "pointer" }}>
            <b>🎯 연습 미션 {done}/{missions.length}</b><span className="muted">{guideOpen ? "접기" : "펼치기"}</span>
          </div>
          {guideOpen && (<>
            <div className="muted" style={{ margin: "6px 0" }}>코인을 눌러 상세 화면으로 들어가서 하나씩 해 보세요.</div>
            {missions.map((m) => <div key={m.t} className={"mission " + (m.done ? "done" : "")}><span className="ck">{m.done ? "✓" : ""}</span><span>{m.t}</span></div>)}
            <button className="cancel" style={{ marginTop: 8, borderColor: "#c9ced8", color: "#8a93a6" }} onClick={() => setSt((s) => ({ ...s, ui: { ...s.ui, hideGuide: true } }))}>미션 숨기기</button>
          </>)}
        </div>
      )}
      <div className="seg">{[["all", "원화"], ["hold", "보유"], ["watch", "관심"]].map(([k, l]) => <button key={k} className={seg === k ? "on" : ""} onClick={() => setSeg(k)}>{l}</button>)}</div>
      <div className="th"><span>한글명</span><span style={{ textAlign: "right" }}>{th("price", "현재가")}</span><span style={{ textAlign: "right" }}>{th("change", "전일대비")}</span><span style={{ textAlign: "right" }}>{th("vol", "거래대금")}</span></div>
      {coins.length === 0 && <div className="muted" style={{ padding: 30, textAlign: "center" }}>시세 불러오는 중…</div>}
      {coins.length > 0 && list.length === 0 && <div className="muted" style={{ padding: 30, textAlign: "center" }}>{seg === "hold" ? "보유한 코인이 없어요." : seg === "watch" ? "★를 눌러 관심 코인을 담아 보세요." : "검색 결과가 없어요."}</div>}
      {list.map((c) => (
        <div className="tr" key={c.sym} onClick={() => open(c.sym)}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button className={"star " + (st.watch.includes(c.sym) ? "on" : "")} onClick={(e) => { e.stopPropagation(); toggle(c.sym); }}>★</button>
            <div><div className="nm">{c.name}</div><div className="sub">{c.sym}/KRW</div></div>
          </div>
          <div className={"r nm " + cls(c.change)}>{fmtP(c.price)}</div>
          <div className={"r " + cls(c.change)}>{pct(c.change)}<div className="sub">{fmtD(c.price, c.price - c.prev)}</div></div>
          <div className="r muted">{Math.round(c.vol / 1e6).toLocaleString("ko-KR")}<span style={{ fontSize: 10 }}>백만</span></div>
        </div>
      ))}
    </div>
  );
}

/* ───────── 투자내역 탭 ───────── */
function HoldTab({ st, setSt, coins, prices, open, notify }) {
  const [sub, setSub] = useState("hold");
  const ev = evaluate(st, prices);
  const byName = Object.fromEntries(coins.map((c) => [c.sym, c.name]));
  const holds = Object.entries(st.pos).map(([sym, p]) => ({ sym, ...p, px: prices[sym] || p.avg })).sort((a, b) => b.qty * b.px - a.qty * a.px);
  return (
    <div>
      <div className="top"><div className="h1">투자내역</div></div>
      <div className="seg">{[["hold", "보유자산"], ["open", `미체결${st.orders.length ? " " + st.orders.length : ""}`], ["hist", "거래내역"]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}</div>
      {sub === "hold" && (<>
        <div className="card">
          <div className="muted">총 보유자산</div>
          <div className="big">{won(ev.total)}</div>
          <div className={cls(ev.pnl)}>시작금 대비 {won(ev.pnl)} ({pct(ev.pnlRate)})</div>
          <div className="row" style={{ marginTop: 10 }}><span className="muted">보유 KRW</span><span>{won(st.cash)}</span></div>
          <div className="row"><span className="muted">주문가능</span><span>{won(availCash(st))}</span></div>
          <div className="row"><span className="muted">총 매수</span><span>{won(ev.cost)}</span></div>
          <div className="row"><span className="muted">총 평가</span><span>{won(ev.value)}</span></div>
          <div className="row"><span className="muted">평가손익</span><span className={cls(ev.unreal)}>{won(ev.unreal)} ({pct(ev.unrealRate)})</span></div>
          <div className="row"><span className="muted">확정(실현) 손익</span><span className={cls(st.realized)}>{won(st.realized)}</span></div>
        </div>
        {holds.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>보유한 코인이 없어요. 거래소 탭에서 코인을 골라 매수해 보세요.</div>}
        {holds.map((h) => {
          const pl = (h.px - h.avg) * h.qty, rate = (h.px / h.avg - 1) * 100;
          return (
            <div className="ordcard" key={h.sym} onClick={() => open(h.sym)} style={{ cursor: "pointer" }}>
              <div className="row"><b>{byName[h.sym] || h.sym} <span className="muted">{h.sym}</span></b><b className={cls(pl)}>{won(pl)} ({pct(rate)})</b></div>
              <div className="row"><span className="muted">평가금액</span><span>{won(h.qty * h.px)}</span></div>
              <div className="row"><span className="muted">매수평균가</span><span>{fmtP(h.avg)}원</span></div>
              <div className="row"><span className="muted">보유수량</span><span>{fmtQ(h.qty)} {h.sym}</span></div>
            </div>
          );
        })}
      </>)}
      {sub === "open" && (<>
        {st.orders.length === 0 && <div className="muted" style={{ padding: 30, textAlign: "center" }}>미체결 주문이 없어요.<br />지정가로 주문하면 여기에 쌓여요.</div>}
        {st.orders.map((o) => <OrderRow key={o.id} o={o} name={byName[o.sym]} price={prices[o.sym] || o.price} onCancel={() => { setSt(T.cancelOrder(st, o.id)); notify("주문을 취소했어요"); }} />)}
      </>)}
      {sub === "hist" && (<>
        {st.history.length === 0 && <div className="muted" style={{ padding: 30, textAlign: "center" }}>체결 내역이 없어요.</div>}
        {st.history.slice(0, 100).map((h, i) => (
          <div className="ordcard" key={i}>
            <div className="row"><span><span className={"pill " + h.side}>{h.side === "buy" ? "매수" : "매도"}</span><b>{byName[h.sym] || h.sym}</b> <span className="muted">{h.kind === "market" ? "시장가" : "지정가"}</span></span><span className="muted">{hhmm(h.t)}</span></div>
            <div className="row"><span className="muted">체결가격</span><span>{fmtP(h.price)}원</span></div>
            <div className="row"><span className="muted">체결수량</span><span>{fmtQ(h.qty)} {h.sym}</span></div>
            <div className="row"><span className="muted">체결금액 / 수수료</span><span>{won(h.total)} / {won(h.fee)}</span></div>
            {h.profit != null && <div className="row"><span className="muted">실현손익</span><b className={cls(h.profit)}>{won(h.profit)}</b></div>}
          </div>
        ))}
      </>)}
    </div>
  );
}

/* ───────── 더보기 탭 ───────── */
const GLOSS = [
  ["코인, 비트코인, 이더리움이 뭔가요?", "비트코인·이더리움은 모두 '코인(가상자산)'의 이름이에요. 이더리움은 지갑이 아니라 비트코인과 같은 종류의 코인이고, 지갑은 코인을 담아 두는 별도의 앱이에요. 거래소 앱에서는 코인 목록에서 하나를 골라 사고팔아요."],
  ["시장가 vs 지정가", "시장가: 지금 걸려 있는 호가대로 바로 체결돼요(빠르지만 가격은 모름). 지정가: 내가 정한 가격에 닿을 때만 체결돼요(가격은 정하지만 체결은 안 될 수 있음)."],
  ["호가창", "다른 사람들이 걸어 둔 사고팔 가격 목록이에요. 파란 쪽(위)은 팔겠다는 가격, 빨간 쪽(아래)은 사겠다는 가격이에요. 가장 아래 파란 줄이 지금 당장 살 수 있는 가격이에요."],
  ["미체결", "지정가 주문을 냈는데 아직 가격이 닿지 않아 체결되지 않은 상태예요. 취소하면 묶여 있던 돈(또는 코인)이 풀려요."],
  ["호가 단위", "주문 가격은 정해진 간격(예: 100원 단위)으로만 입력할 수 있어요. ＋/− 버튼이 이 간격으로 움직여요."],
  ["수수료", `사고팔 때마다 거래금액의 ${FEE_RATE * 100}%가 빠져요. 사자마자 팔면 수수료만큼 손해예요.`],
  ["평균 매수가 · 평가손익", "여러 번에 나눠 사면 평균 가격이 계산돼요. 평가손익은 지금 시세로 팔았다고 가정한 손익이고, 실제로 팔아야 확정(실현) 손익이 돼요."],
  ["손실 줄이는 기본 습관", "① 잃어도 괜찮은 돈만 쓰기 ② 한 번에 다 사지 않고 3~5번 나눠 사기 ③ 한 코인에 몰지 않기 ④ 팔 기준(손절·익절 가격)을 사기 전에 정하기."],
];
function MoreTab({ st, setSt, missions, notify }) {
  const [open, setOpen] = useState(0);
  const resetTo = (n) => { if (confirm(`${won(n)}으로 처음부터 다시 시작할까요? 모든 기록이 지워져요.`)) { setSt(T.initialState(n)); notify("초기화했어요"); } };
  return (
    <div>
      <div className="top"><div className="h1">더보기</div></div>
      <div className="card">
        <b>🎯 연습 미션</b>
        {missions.map((m) => <div key={m.t} className={"mission " + (m.done ? "done" : "")}><span className="ck">{m.done ? "✓" : ""}</span><span>{m.t}</span></div>)}
        {st.ui?.hideGuide && <button className="cancel" style={{ marginTop: 6 }} onClick={() => setSt((s) => ({ ...s, ui: { ...s.ui, hideGuide: false } }))}>거래소 화면에 다시 표시</button>}
      </div>
      <div className="top" style={{ borderTop: "1px solid #eef0f4" }}><b>이용 가이드 · 용어</b></div>
      {GLOSS.map(([q, a], i) => <div className="acc" key={q}><b onClick={() => setOpen(open === i ? -1 : i)}>{open === i ? "▾" : "▸"} {q}</b>{open === i && <p>{a}</p>}</div>)}
      <div className="card">
        <b>처음부터 다시 시작</b>
        <div className="muted" style={{ margin: "6px 0" }}>시작 금액을 골라요. (가상 돈이라 비용 없음)</div>
        <div style={{ display: "flex", gap: 6 }}>{INIT_CHOICES.map((n) => <button key={n} className="chip" style={{ flex: 1 }} onClick={() => resetTo(n)}>{n >= 1e8 ? "1억원" : n / 1e4 + "만원"}</button>)}</div>
      </div>
      <div className="muted" style={{ padding: "0 16px 16px", lineHeight: 1.6 }}>
        시세와 호가는 실제 거래소 공개 데이터를 쓰지만 주문은 이 앱 안에서만 가상으로 체결돼요. 미체결 주문은 앱을 열어 둔 동안에만 체결 여부를 확인해요. 실제 거래소와 체결 방식·수수료·호가 단위가 조금 다를 수 있고, 연습 결과가 실제 수익을 보장하지 않아요.
      </div>
    </div>
  );
}

/* ───────── 앱 전체 ───────── */
export default function Page() {
  const [st, setSt] = useState(T.initialState());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("market");
  const [sel, setSel] = useState(null);
  const [coins, setCoins] = useState([]);
  const [source, setSource] = useState("");
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState(null);
  const stRef = useRef(st); stRef.current = st;

  const notify = (m) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setSt({ ...T.initialState(), ...JSON.parse(s) }); } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }, [st, loaded]);

  useEffect(() => {
    let stop = false;
    const go = async () => {
      try {
        const r = await fetch("/api/market", { cache: "no-store" }); const d = await r.json();
        if (!stop && d.ok) { setCoins(d.coins); setSource(d.source); setOffline(false); } else if (!stop) setOffline(true);
      } catch { if (!stop) setOffline(true); }
    };
    go(); const id = setInterval(go, 4000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  const prices = useMemo(() => Object.fromEntries(coins.map((c) => [c.sym, c.price])), [coins]);
  useEffect(() => {
    if (!coins.length || !stRef.current.orders.length) return;
    const r = T.matchOrders(stRef.current, prices);
    if (r.filled.length) { setSt(r.state); notify(`지정가 주문 ${r.filled.length}건이 체결됐어요! (투자내역 확인)`); }
  }, [coins]);

  const missions = [
    { t: "시장가로 코인 매수해 보기", done: st.history.some((h) => h.kind === "market" && h.side === "buy") },
    { t: "지정가로 주문 걸어 보기 (호가를 눌러 가격 입력)", done: st.stats.limitPlaced > 0 },
    { t: "미체결 주문 취소해 보기 (투자내역 › 미체결)", done: st.stats.canceled > 0 },
    { t: "같은 코인을 3번 나눠서 사 보기", done: Object.values(st.history.filter((h) => h.side === "buy").reduce((a, h) => ((a[h.sym] = (a[h.sym] || 0) + 1), a), {})).some((n) => n >= 3) },
    { t: "3종류 이상 코인을 보유해 보기 (분산)", done: Object.keys(st.pos).length >= 3 },
    { t: "매도해서 손익 확정해 보기", done: st.history.some((h) => h.side === "sell") },
  ];

  const coin = sel ? coins.find((c) => c.sym === sel) : null;
  const toggleWatch = (sym) => setSt((s) => ({ ...s, watch: s.watch.includes(sym) ? s.watch.filter((x) => x !== sym) : [...s.watch, sym] }));
  const open = (sym) => { setSel(sym); window.scrollTo(0, 0); };

  return (
    <>
      {sel && coin ? (
        <Detail key={sel} coin={coin} st={st} setSt={setSt} notify={notify} onBack={() => setSel(null)} onToggleWatch={toggleWatch} />
      ) : (
        <div className="app">
          {offline && <div className="err" style={{ margin: 0, borderRadius: 0 }}>시세 연결이 불안정해요. 다시 시도하는 중…</div>}
          {tab === "market" && <MarketTab coins={coins} st={st} setSt={setSt} open={open} missions={missions} />}
          {tab === "hold" && <HoldTab st={st} setSt={setSt} coins={coins} prices={prices} open={open} notify={notify} />}
          {tab === "more" && <MoreTab st={st} setSt={setSt} missions={missions} notify={notify} />}
          <div className="nav">
            {[["market", "📈", "거래소"], ["hold", "💼", "투자내역"], ["more", "☰", "더보기"]].map(([k, ic, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><span className="ic">{ic}</span>{l}</button>
            ))}
          </div>
        </div>
      )}
      {loaded && !st.ui?.introSeen && st.history.length === 0 && (
        <div className="modal"><div className="sheet">
          <div className="h1">코인 모의투자 트레이너 👋</div>
          <p style={{ lineHeight: 1.7 }}>실제 거래소 앱과 같은 화면으로 연습하는 앱이에요. 진짜 돈은 쓰지 않고, <b>가상 {won(st.init)}</b>으로 시작해요.</p>
          <div className="mission"><span className="ck" style={{ background: "#093687", borderColor: "#093687" }}>1</span><span>거래소 탭에서 코인을 눌러요</span></div>
          <div className="mission"><span className="ck" style={{ background: "#093687", borderColor: "#093687" }}>2</span><span>호가·차트를 보고 매수 또는 매도를 눌러요</span></div>
          <div className="mission"><span className="ck" style={{ background: "#093687", borderColor: "#093687" }}>3</span><span>투자내역 탭에서 내 손익을 확인해요</span></div>
          <div className="btns"><button style={{ background: "#093687", color: "#fff" }} onClick={() => setSt((s) => ({ ...s, ui: { ...s.ui, introSeen: true } }))}>시작하기</button></div>
        </div></div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
