import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const FINNHUB = process.env.FINNHUB_API_KEY;
const CACHE = new Map();
const TTL_MS = 60 * 60 * 1000;

function getCache(key) {
  const v = CACHE.get(key);
  if (!v) return null;
  if (Date.now() - v.t > TTL_MS) { CACHE.delete(key); return null; }
  return v.data;
}
function setCache(key, data) { CACHE.set(key, { t: Date.now(), data }); }

function mondayOf(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0,0,0,0);
  return d;
}
function fmt(d) {
  return d.toISOString().slice(0,10);
}
function weekRange(weekParam) {
  const mon = mondayOf(weekParam);
  const fri = new Date(mon); fri.setUTCDate(mon.getUTCDate() + 4);
  return { from: fmt(mon), to: fmt(fri), monday: mon };
}

// Deterministic PRNG (mulberry32)
function prng(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seedFromDate(d) {
  const s = fmt(d);
  let h = 2166136261;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function synthDemo(weekParam) {
  const { from, to, monday } = weekRange(weekParam);
  const rng = prng(seedFromDate(monday));
  const tickers = [
    { s: 'NVDA', name: 'NVIDIA Corp', spot: 1180 },
    { s: 'AAPL', name: 'Apple Inc', spot: 215 },
    { s: 'MSFT', name: 'Microsoft Corp', spot: 440 },
    { s: 'AMZN', name: 'Amazon.com', spot: 195 },
    { s: 'TSLA', name: 'Tesla Inc', spot: 250 },
    { s: 'META', name: 'Meta Platforms', spot: 520 },
    { s: 'GOOG', name: 'Alphabet Inc', spot: 178 },
    { s: 'NFLX', name: 'Netflix Inc', spot: 690 },
    { s: 'CRM',  name: 'Salesforce', spot: 245 },
    { s: 'AMD',  name: 'AMD Inc', spot: 165 },
    { s: 'ORCL', name: 'Oracle Corp', spot: 142 },
    { s: 'INTC', name: 'Intel Corp', spot: 33 },
  ];
  const rows = tickers.map((t, i) => {
    const day = i % 5; // Mon-Fri
    const reportDate = new Date(monday); reportDate.setUTCDate(monday.getUTCDate() + day);
    // ensure one >+10pp and one <-5pp by injecting
    let implied, realizedHist;
    if (i === 0) {
      // big overpriced
      implied = 14 + rng()*3;
      realizedHist = Array.from({length:8}, () => 2 + rng()*2);
    } else if (i === 1) {
      // big underpriced
      implied = 3 + rng()*1;
      realizedHist = Array.from({length:8}, () => 8 + rng()*3);
    } else {
      const base = 4 + rng()*8;
      implied = base + (rng()*8 - 4);
      realizedHist = Array.from({length:8}, () => Math.max(0.5, base + (rng()*5 - 2.5)));
    }
    const avg = realizedHist.reduce((a,b)=>a+b,0) / realizedHist.length;
    return {
      ticker: t.s,
      name: t.name,
      reportDate: fmt(reportDate),
      hour: i % 2 === 0 ? 'amc' : 'bmo',
      spot: t.spot,
      impliedMove: +implied.toFixed(2),
      avgRealized: +avg.toFixed(2),
      realizedHistory: realizedHist.map((v,idx)=>({ q: `Q${idx+1}`, value: +v.toFixed(2) })),
      stdDev: +Math.sqrt(realizedHist.reduce((a,b)=>a+(b-avg)*(b-avg),0)/realizedHist.length).toFixed(2),
      mispricingPp: +(implied - avg).toFixed(2),
      atmStrike: Math.round(t.spot),
      expiry: null,
    };
  }).sort((a,b)=>Math.abs(b.mispricingPp)-Math.abs(a.mispricingPp));
  return { from, to, mode: 'demo', count: rows.length, rows };
}

async function fetchFinnhubCalendar(from, to) {
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('finnhub ' + res.status);
  const json = await res.json();
  return json.earningsCalendar || [];
}

async function fetchHistoricalEarnings(symbol) {
  // Finnhub /stock/earnings returns last quarters with surprise.
  const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&limit=8&token=${FINNHUB}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    if (!Array.isArray(j)) return [];
    // period is the report date; sort desc, take 8
    return j.map(x => x.period).filter(Boolean).slice(0, 8);
  } catch { return []; }
}

async function getRealizedMoves(symbol, earningsDates) {
  if (!earningsDates.length) return [];
  // Fetch enough history covering oldest date - 7 days to today
  const dates = earningsDates.map(d => new Date(d + 'T00:00:00Z'));
  const minD = new Date(Math.min(...dates.map(d=>d.getTime())));
  minD.setUTCDate(minD.getUTCDate() - 14);
  const maxD = new Date(); maxD.setUTCDate(maxD.getUTCDate() + 1);
  let hist;
  try {
    hist = await yahooFinance.chart(symbol, {
      period1: minD, period2: maxD, interval: '1d'
    });
  } catch { return []; }
  const quotes = hist?.quotes || [];
  if (!quotes.length) return [];
  const closes = quotes.map(q => ({ d: q.date instanceof Date ? q.date : new Date(q.date), c: q.close })).filter(x=>x.c!=null);
  const moves = [];
  for (const ed of earningsDates) {
    const target = new Date(ed + 'T00:00:00Z').getTime();
    // find index of closest trading day to target
    let idx = -1;
    for (let i=0;i<closes.length;i++) {
      if (closes[i].d.getTime() >= target) { idx = i; break; }
    }
    if (idx <= 0 || idx >= closes.length) continue;
    // close_before = previous trading day; close_after = next trading day after report
    const before = closes[idx-1].c;
    // 'after' should be at least one trading day after the report; pick idx+1
    const afterIdx = idx + 1 < closes.length ? idx + 1 : idx;
    const after = closes[afterIdx].c;
    if (!before || !after) continue;
    const move = Math.abs((after - before) / before) * 100;
    if (Number.isFinite(move)) moves.push(+move.toFixed(2));
  }
  return moves.slice(0, 8);
}

async function processTicker(item) {
  const symbol = item.symbol;
  const reportDate = item.date;
  try {
    // 1) spot
    const quote = await yahooFinance.quote(symbol);
    const spot = quote?.regularMarketPrice;
    if (!spot || !Number.isFinite(spot)) return null;
    // 2) options - get expirationDates list
    const optsRoot = await yahooFinance.options(symbol);
    const expirations = optsRoot?.expirationDates || [];
    if (!expirations.length) return null;
    const earningsT = new Date(reportDate + 'T00:00:00Z').getTime();
    let chosen = null;
    for (const ed of expirations) {
      const t = ed instanceof Date ? ed.getTime() : new Date(ed).getTime();
      if (t >= earningsT) { chosen = ed; break; }
    }
    if (!chosen) return null;
    const chainResp = await yahooFinance.options(symbol, { date: chosen });
    const chain = chainResp?.options?.[0];
    if (!chain) return null;
    const calls = chain.calls || [];
    const puts = chain.puts || [];
    if (!calls.length || !puts.length) return null;
    // ATM call / put
    const atmCall = calls.reduce((a,b)=>Math.abs(b.strike-spot)<Math.abs(a.strike-spot)?b:a);
    const atmPut  = puts.reduce((a,b)=>Math.abs(b.strike-spot)<Math.abs(a.strike-spot)?b:a);
    // Validate bid AND ask > 0 on BOTH legs
    const cb = atmCall.bid, ca = atmCall.ask, pb = atmPut.bid, pa = atmPut.ask;
    if (!(cb > 0) || !(ca > 0) || !(pb > 0) || !(pa > 0)) return null;
    const midCall = (cb + ca) / 2;
    const midPut  = (pb + pa) / 2;
    const impliedMove = ((midCall + midPut) / spot) * 100;
    if (!Number.isFinite(impliedMove)) return null;
    // 3) realized history
    const hist = await fetchHistoricalEarnings(symbol);
    const realizedMoves = await getRealizedMoves(symbol, hist);
    if (realizedMoves.length < 2) return null; // need some history
    const avg = realizedMoves.reduce((a,b)=>a+b,0) / realizedMoves.length;
    const variance = realizedMoves.reduce((a,b)=>a+(b-avg)*(b-avg),0) / realizedMoves.length;
    const std = Math.sqrt(variance);
    return {
      ticker: symbol,
      name: quote?.shortName || quote?.longName || symbol,
      reportDate,
      hour: item.hour || null,
      spot: +spot.toFixed(2),
      impliedMove: +impliedMove.toFixed(2),
      avgRealized: +avg.toFixed(2),
      stdDev: +std.toFixed(2),
      realizedHistory: realizedMoves.map((v,idx)=>({ q: `Q${idx+1}`, value: v })),
      mispricingPp: +(impliedMove - avg).toFixed(2),
      atmStrike: atmCall.strike,
      expiry: chosen instanceof Date ? chosen.toISOString().slice(0,10) : new Date(chosen).toISOString().slice(0,10),
    };
  } catch (e) {
    return null;
  }
}

async function processLive(weekParam) {
  const { from, to } = weekRange(weekParam);
  const cacheKey = `live:${from}:${to}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const today = fmt(new Date());
  let cal = await fetchFinnhubCalendar(from, to);
  // Filter: reportDate >= today (no past), US only (Finnhub doesn't always tag — filter by symbol pattern: no dot)
  cal = cal.filter(x => x?.symbol && x?.date && x.date >= today && !x.symbol.includes('.'));
  // Dedupe
  const seen = new Set();
  cal = cal.filter(x => seen.has(x.symbol) ? false : (seen.add(x.symbol), true));
  // Cap to avoid timeouts (Finnhub free tier can be heavy). Cap at 40.
  cal = cal.slice(0, 40);
  // Process with limited concurrency
  const concurrency = 6;
  const rows = [];
  let idx = 0;
  await Promise.all(Array.from({length: concurrency}, async () => {
    while (idx < cal.length) {
      const cur = cal[idx++];
      const r = await processTicker(cur);
      if (r) rows.push(r);
    }
  }));
  rows.sort((a,b) => Math.abs(b.mispricingPp) - Math.abs(a.mispricingPp));
  const out = { from, to, mode: 'live', count: rows.length, rows };
  setCache(cacheKey, out);
  return out;
}

async function liveQuote(symbol) {
  if (!symbol) return null;
  try {
    const q = await yahooFinance.quote(symbol);
    const mid = q?.regularMarketPrice;
    if (!mid) return null;
    return { symbol, price: +mid.toFixed(2), bid: q.bid, ask: q.ask, name: q.shortName || symbol };
  } catch { return null; }
}

async function optionQuote(symbol, strike, expiry, type) {
  // expiry expected as 'YYYY-MM-DD'
  try {
    const expDate = new Date(expiry + 'T00:00:00Z');
    const chainResp = await yahooFinance.options(symbol, { date: expDate });
    const chain = chainResp?.options?.[0];
    if (!chain) return null;
    const arr = type === 'put' ? (chain.puts || []) : (chain.calls || []);
    const exact = arr.find(o => Math.abs(o.strike - +strike) < 0.01);
    if (!exact) return null;
    const bid = exact.bid, ask = exact.ask, last = exact.lastPrice;
    let mid = null;
    if (bid > 0 && ask > 0) mid = (bid + ask) / 2;
    else if (last > 0) mid = last;
    if (!mid) return null;
    return { symbol, strike: +strike, expiry, type, price: +mid.toFixed(2), bid, ask };
  } catch { return null; }
}

export async function GET(request, { params }) {
  const path = params?.path || [];
  const route = path.join('/');
  const { searchParams } = new URL(request.url);
  try {
    if (route === 'health') {
      return NextResponse.json({ ok: true, hasKey: !!FINNHUB });
    }
    if (route === 'earnings') {
      const week = searchParams.get('week');
      const demo = searchParams.get('demo') === 'true';
      if (demo) return NextResponse.json(synthDemo(week));
      if (!FINNHUB) return NextResponse.json({ error: 'FINNHUB_API_KEY missing' }, { status: 500 });
      const data = await processLive(week);
      return NextResponse.json(data);
    }
    if (route === 'quote') {
      const sym = searchParams.get('symbol');
      const data = await liveQuote(sym);
      return NextResponse.json(data || { error: 'not found' }, { status: data ? 200 : 404 });
    }
    if (route === 'option') {
      const sym = searchParams.get('symbol');
      const strike = searchParams.get('strike');
      const expiry = searchParams.get('expiry');
      const type = searchParams.get('type');
      const data = await optionQuote(sym, strike, expiry, type);
      return NextResponse.json(data || { error: 'not found' }, { status: data ? 200 : 404 });
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
