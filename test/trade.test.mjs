import assert from "node:assert/strict";
import * as T from "../lib/trade.mjs";
const { initialState: init, marketBuy, marketSell, placeLimit, cancelOrder, matchOrders, evaluate, availCash, availQty, walkBuy, snap, tickSize } = T;
const asks = [{ price: 100_000_000, size: 0.01 }, { price: 100_100_000, size: 1 }];
const bids = [{ price: 99_900_000, size: 0.01 }, { price: 99_800_000, size: 1 }];

// 시장가 매수: 호가 소진(1호가 0.01개 다 먹고 2호가로 넘어감)
let s = init(); let r = marketBuy(s, "BTC", 5_000_000, asks, 1e8); s = r.state;
assert.ok(s.pos.BTC.avg > 100_000_000 && s.pos.BTC.avg < 100_100_000, "avg " + s.pos.BTC.avg);
assert.ok(Math.abs(s.cash - 5_000_000) < 1, "500만원 사용 후 잔액 cash=" + s.cash);
// 부족/최소 주문 거부
assert.ok(marketBuy(init(), "BTC", 99_999_999, asks, 1e8).error);
assert.ok(marketBuy(init(), "BTC", 1000, asks, 1e8).error);
// 지정가 매수: 현금 잠금, 이중 사용 방지
s = init(); s = placeLimit(s, "ETH", "buy", 4_000_000, 2).state;
assert.ok(Math.abs(availCash(s) - (10_000_000 - 8_000_000 * 1.0005)) < 1);
assert.ok(placeLimit(s, "ETH", "buy", 4_000_000, 1).error, "잠긴 돈 초과 거부");
// 호가단위 위반 거부
assert.ok(placeLimit(init(), "BTC", "buy", 100_000_123, 0.01).error);
// 가격 닿기 전엔 미체결, 닿으면 유리한 가격으로 체결
let m = matchOrders(s, { ETH: 4_100_000 }); assert.equal(m.filled.length, 0);
m = matchOrders(s, { ETH: 3_900_000 }); assert.equal(m.filled.length, 1);
assert.equal(m.filled[0].fillPrice, 3_900_000);
s = m.state; assert.equal(s.orders.length, 0); assert.equal(s.pos.ETH.qty, 2);
// 지정가 매도: 보유 수량 잠금 + 초과 거부 + 체결 + 실현손익
s = placeLimit(s, "ETH", "sell", 4_500_000, 2).state;
assert.equal(availQty(s, "ETH"), 0); assert.ok(placeLimit(s, "ETH", "sell", 4_500_000, 0.1).error);
assert.ok(marketSell(s, "ETH", 1, bids, 1).error, "잠긴 수량 시장가 매도 거부");
s = matchOrders(s, { ETH: 4_600_000 }).state; assert.equal(s.pos.ETH, undefined); assert.ok(s.realized > 0);
// 취소 시 자금 복구
let c = placeLimit(init(), "XRP", "buy", 1000, 1000).state; const id = c.orders[0].id;
c = cancelOrder(c, id); assert.equal(availCash(c), 10_000_000); assert.equal(c.stats.canceled, 1);
// 시장가 매도 + 손실
let t = marketBuy(init(), "BTC", 10_000_000, asks, 1e8).state;
t = marketSell(t, "BTC", t.pos.BTC.qty, bids, 1e8).state; assert.ok(t.realized < 0);
assert.ok(evaluate(t, {}).total < 10_000_000);
// 호가 단위
assert.equal(tickSize(100_000_000), 1000); assert.equal(tickSize(850), 1); assert.equal(snap(4_123_456), 4_123_000);
console.log("모든 매매 로직 테스트 통과 ✅");
