'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';
import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';

const fetcher = (url) => fetch(url).then(r => r.json());

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
const fmtISO = (d) => d.toISOString().slice(0,10);
function fmtFriendly(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function dayShort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
}
function daysUntil(iso) {
  if (!iso) return null;
  const t = new Date(iso + 'T00:00:00Z').getTime();
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((t - now.getTime()) / 86400000);
}

const MispricingBadge = ({ pp, size = 'sm' }) => {
  const over = pp > 0;
  const cls = over ? 'border-over text-over' : 'border-under text-under';
  const sz = size === 'lg' ? 'text-sm px-3 py-1.5' : 'text-[10px] px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1.5 border ${cls} font-mono tracking-wide ${sz}`}>
      {pp > 0 ? '+' : ''}{pp.toFixed(1)} PP {over ? 'OVERPRICED' : 'UNDERPRICED'}
    </span>
  );
};

const Sparkline = ({ data }) => {
  if (!data?.length) return null;
  return (
    <div className="h-10 w-32">
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line type="monotone" dataKey="value" stroke="#71717A" strokeWidth={1.2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-surface border border-border px-3 py-2 text-xs font-mono">
      <div className="text-fg font-semibold mb-1">{p.ticker || p.q}</div>
      {p.impliedMove != null && <div className="text-muted">implied: <span className="text-fg">{p.impliedMove.toFixed(2)}%</span></div>}
      {p.avgRealized != null && <div className="text-muted">avg realized: <span className="text-fg">{p.avgRealized.toFixed(2)}%</span></div>}
      {p.mispricingPp != null && <div className="text-muted">mispricing: <span className={p.mispricingPp >= 0 ? 'text-over' : 'text-under'}>{p.mispricingPp >= 0 ? '+' : ''}{p.mispricingPp.toFixed(2)} pp</span></div>}
      {p.value != null && p.q && <div className="text-muted">move: <span className="text-fg">{p.value.toFixed(2)}%</span></div>}
    </div>
  );
};

const Hero = ({ row }) => {
  if (!row) return null;
  const over = row.mispricingPp > 0;
  return (
    <div className="bg-surface border border-border p-6">
      <div className="grid grid-cols-12 gap-6 items-center">
        <div className="col-span-12 md:col-span-3">
          <div className="section-heading mb-2">Largest mispricing</div>
          <div className="font-mono text-4xl md:text-5xl font-semibold tracking-tight text-fg">{row.ticker}</div>
          <div className="text-xs text-muted truncate">{row.name}</div>
          <div className="text-xs text-muted mt-2 font-mono">Reports {fmtFriendly(row.reportDate)}{row.hour ? ` · ${row.hour.toUpperCase()}` : ''}</div>
        </div>
        <div className="col-span-6 md:col-span-2">
          <div className="section-heading mb-1">Implied</div>
          <div className="font-mono text-2xl text-fg tabular-nums">{row.impliedMove.toFixed(2)}<span className="text-muted text-base">%</span></div>
        </div>
        <div className="col-span-6 md:col-span-2">
          <div className="section-heading mb-1">Avg Realized</div>
          <div className="font-mono text-2xl text-fg tabular-nums">{row.avgRealized.toFixed(2)}<span className="text-muted text-base">%</span></div>
        </div>
        <div className="col-span-12 md:col-span-3 flex flex-col items-start gap-2">
          <MispricingBadge pp={row.mispricingPp} size="lg" />
          <div className="text-[11px] text-muted font-mono">{over ? 'options overpriced · sell vol' : 'options underpriced · buy vol'}</div>
        </div>
        <div className="col-span-12 md:col-span-2 flex flex-col items-end">
          <div className="section-heading mb-1 self-start md:self-end">8q sparkline</div>
          <Sparkline data={row.realizedHistory} />
        </div>
      </div>
    </div>
  );
};

const Leaderboard = ({ rows, selected, onSelect }) => {
  const data = rows.map(r => ({ ...r, signed: r.mispricingPp }));
  const max = Math.max(...data.map(d => Math.abs(d.signed)), 5);
  return (
    <div className="bg-surface border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-heading">Leaderboard · {rows.length} tickers</div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-under inline-block"></span>UNDER</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-over inline-block"></span>OVER</span>
        </div>
      </div>
      <div className="space-y-0">
        {data.map(r => {
          const w = (Math.abs(r.signed) / max) * 50;
          const isSel = r.ticker === selected;
          return (
            <div key={r.ticker}
              onClick={() => onSelect(r.ticker)}
              className={`grid grid-cols-12 items-center gap-2 py-2 px-2 cursor-pointer border-l-2 ${isSel ? 'border-l-fg bg-bg/40' : 'border-l-transparent hover:bg-bg/30'}`}>
              <div className="col-span-2 font-mono text-sm text-fg">{r.ticker}</div>
              <div className="col-span-7 relative h-5">
                <div className="absolute top-1/2 left-1/2 w-px h-5 bg-border -translate-y-1/2"></div>
                {r.signed < 0 ? (
                  <div className="absolute top-1/2 right-1/2 h-3 bg-under -translate-y-1/2" style={{ width: `${w}%` }} />
                ) : (
                  <div className="absolute top-1/2 left-1/2 h-3 bg-over -translate-y-1/2" style={{ width: `${w}%` }} />
                )}
              </div>
              <div className={`col-span-3 text-right font-mono text-xs tabular-nums ${r.signed >= 0 ? 'text-over' : 'text-under'}`}>
                {r.signed >= 0 ? '+' : ''}{r.signed.toFixed(2)} pp
              </div>
            </div>
          );
        })}
        {!data.length && (
          <div className="text-center text-muted text-sm py-12 font-mono">No qualifying earnings this week.<br/>Try a different week or toggle DEMO MODE.</div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="border border-border p-2">
    <div className="text-[10px] text-muted uppercase tracking-widest font-mono">{label}</div>
    <div className="font-mono text-sm text-fg tabular-nums mt-1">{value}</div>
  </div>
);

const DetailPanel = ({ row }) => {
  if (!row) {
    return (
      <div className="bg-surface border border-border p-5 h-full flex items-center justify-center text-muted text-xs font-mono">
        Select a ticker
      </div>
    );
  }
  const data = row.realizedHistory || [];
  const percentile = (() => {
    if (!data.length) return 0;
    const sorted = [...data].map(d=>d.value).sort((a,b)=>a-b);
    const below = sorted.filter(v => v <= row.impliedMove).length;
    return Math.round((below / sorted.length) * 100);
  })();
  const yMax = Math.max(...data.map(d=>d.value), row.impliedMove) * 1.15;
  return (
    <div className="bg-surface border border-border p-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="font-mono text-2xl text-fg">{row.ticker}</div>
          <div className="text-[11px] text-muted">{row.name}</div>
        </div>
        <MispricingBadge pp={row.mispricingPp} />
      </div>
      <div className="text-[11px] text-muted font-mono mb-2">Reports {fmtFriendly(row.reportDate)}{row.hour ? ` · ${row.hour.toUpperCase()}` : ''}{row.expiry ? ` · expiry ${row.expiry}` : ''}</div>
      <div className="section-heading mb-2 mt-2">Last {data.length}q realized vs implied</div>
      <div className="h-44 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#26262A" strokeOpacity={0.3} vertical={false} />
            <XAxis dataKey="q" tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#26262A' }} tickLine={false} />
            <YAxis domain={[0, yMax]} tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#26262A' }} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#26262A', fillOpacity: 0.2 }} />
            <ReferenceLine y={row.impliedMove} stroke="#F4F4F5" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: `implied ${row.impliedMove.toFixed(1)}%`, position: 'insideTopRight', fill: '#F4F4F5', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
            <Bar dataKey="value" fill="#71717A" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4">
        <Stat label="avg realized" value={`${row.avgRealized.toFixed(2)}%`} />
        <Stat label="std dev" value={`${row.stdDev.toFixed(2)}`} />
        <Stat label="implied" value={`${row.impliedMove.toFixed(2)}%`} />
        <Stat label="pctile" value={`${percentile}%`} />
      </div>
    </div>
  );
};

const ScatterPanel = ({ rows }) => {
  const data = rows.map(r => ({ ...r, x: r.avgRealized, y: r.impliedMove }));
  const maxV = Math.max(...data.map(d=>Math.max(d.x, d.y)), 5) * 1.1;
  const line = [{ x: 0, y: 0 }, { x: maxV, y: maxV }];
  return (
    <div className="bg-surface border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-heading">Implied vs Avg Realized · diagonal = fair</div>
        <div className="text-[10px] font-mono text-muted">above line: overpriced · below: underpriced</div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="#26262A" strokeOpacity={0.3} />
            <XAxis type="number" dataKey="x" domain={[0, maxV]} tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#26262A' }} tickLine={false}
              label={{ value: 'avg realized %', position: 'insideBottom', dy: 16, fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
            <YAxis type="number" dataKey="y" domain={[0, maxV]} tick={{ fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#26262A' }} tickLine={false}
              label={{ value: 'implied %', angle: -90, position: 'insideLeft', dx: 8, fill: '#71717A', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
            <ZAxis range={[60, 60]} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#26262A' }} />
            <Scatter data={line} line={{ stroke: '#3F3F46', strokeDasharray: '3 3' }} shape={() => null} isAnimationActive={false} />
            <Scatter data={data} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.mispricingPp >= 0 ? '#EF4444' : '#10B981'} fillOpacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const POS_KEY = 'ee.positions.v1';

function loadPositions() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '[]'); } catch { return []; }
}
function savePositions(p) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
}

const PositionCard = ({ pos, earningsRow, onUpdate, onRemove }) => {
  const [livePrice, setLivePrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState(pos.notes || '');

  const fetchPrice = useCallback(async () => {
    setLoading(true);
    try {
      if (pos.type === 'shares') {
        const r = await fetch(`/api/quote?symbol=${pos.ticker}`).then(r=>r.json());
        if (r?.price) setLivePrice(r.price);
      } else {
        const r = await fetch(`/api/option?symbol=${pos.ticker}&strike=${pos.strike}&expiry=${pos.expiry}&type=${pos.type}`).then(r=>r.json());
        if (r?.price) setLivePrice(r.price);
      }
    } catch {} finally { setLoading(false); }
  }, [pos]);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  const pnl = useMemo(() => {
    if (livePrice == null) return null;
    const mult = pos.type === 'shares' ? 1 : 100;
    const diff = (livePrice - pos.entry) * pos.qty * mult;
    const pct = ((livePrice - pos.entry) / pos.entry) * 100;
    return { dollar: diff, pct };
  }, [livePrice, pos]);

  const dte = pos.expiry ? daysUntil(pos.expiry) : null;
  const dteWarn = dte != null && dte < 14;

  return (
    <div className="border border-border bg-surface p-3">
      {earningsRow && (
        <div className="-m-3 mb-3 px-3 py-1.5 border-b border-border bg-bg/60">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-mono tracking-widest text-over">
              EARNINGS {dayShort(earningsRow.reportDate)} {fmtFriendly(earningsRow.reportDate).split(',')[1]?.trim()}
            </div>
            <MispricingBadge pp={earningsRow.mispricingPp} />
          </div>
          <div className="flex gap-4 mt-1 text-[10px] font-mono text-muted">
            <span>implied <span className="text-fg">{earningsRow.impliedMove.toFixed(2)}%</span></span>
            <span>avg realized <span className="text-fg">{earningsRow.avgRealized.toFixed(2)}%</span></span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-base text-fg">{pos.ticker}</div>
          <div className="text-[10px] font-mono text-muted uppercase">
            {pos.type === 'shares' ? `${pos.qty} shares` : `${pos.qty} ${pos.type} ${pos.strike} ${pos.expiry}`}
            {dte != null && <span className={`ml-2 ${dteWarn ? 'text-over' : 'text-muted'}`}>· {dte}d DTE</span>}
          </div>
        </div>
        <button onClick={() => onRemove(pos.id)} className="text-[10px] font-mono text-muted hover:text-over">×</button>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] font-mono">
        <div>
          <div className="text-muted text-[10px]">entry</div>
          <div className="text-fg tabular-nums">{pos.entry.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted text-[10px]">mark {loading && '…'}</div>
          <div className="text-fg tabular-nums">{livePrice == null ? '—' : livePrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted text-[10px]">P&amp;L</div>
          <div className={`tabular-nums ${pnl == null ? 'text-muted' : pnl.dollar >= 0 ? 'text-under' : 'text-over'}`}>
            {pnl == null ? '—' : `${pnl.dollar >= 0 ? '+' : ''}${pnl.dollar.toFixed(0)} · ${pnl.pct >= 0 ? '+' : ''}${pnl.pct.toFixed(1)}%`}
          </div>
        </div>
      </div>
      <input
        value={notes}
        onChange={(e)=>{ setNotes(e.target.value); onUpdate(pos.id, { notes: e.target.value }); }}
        placeholder="notes…"
        className="mt-3 w-full text-[11px]"
      />
    </div>
  );
};

const Portfolio = ({ earningsByTicker }) => {
  const [positions, setPositions] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ticker: '', type: 'shares', strike: '', expiry: '', entry: '', qty: '' });

  useEffect(() => { setPositions(loadPositions()); }, []);

  const update = (id, patch) => {
    setPositions(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch } : p);
      savePositions(next); return next;
    });
  };
  const remove = (id) => {
    setPositions(prev => {
      const next = prev.filter(p => p.id !== id);
      savePositions(next); return next;
    });
  };
  const add = () => {
    if (!form.ticker || !form.entry || !form.qty) return;
    if (form.type !== 'shares' && (!form.strike || !form.expiry)) return;
    const pos = {
      id: Math.random().toString(36).slice(2),
      ticker: form.ticker.toUpperCase().trim(),
      type: form.type,
      strike: form.type === 'shares' ? null : +form.strike,
      expiry: form.type === 'shares' ? null : form.expiry,
      entry: +form.entry,
      qty: +form.qty,
      notes: '',
    };
    const next = [...positions, pos];
    setPositions(next); savePositions(next);
    setForm({ ticker: '', type: 'shares', strike: '', expiry: '', entry: '', qty: '' });
    setOpen(false);
  };

  return (
    <div className="bg-surface border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-heading">Portfolio</div>
        <button onClick={()=>setOpen(o=>!o)} className="text-[10px] font-mono px-2 py-1 border border-border hover:border-fg text-fg">
          {open ? 'CANCEL' : '+ ADD'}
        </button>
      </div>
      {open && (
        <div className="border border-border p-3 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="TICKER" value={form.ticker} onChange={e=>setForm({...form, ticker: e.target.value})} />
            <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
              <option value="shares">Shares</option>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>
          {form.type !== 'shares' && (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.01" placeholder="Strike" value={form.strike} onChange={e=>setForm({...form, strike: e.target.value})} />
              <input type="date" placeholder="Expiry" value={form.expiry} onChange={e=>setForm({...form, expiry: e.target.value})} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="number" step="0.01" placeholder="Entry Price" value={form.entry} onChange={e=>setForm({...form, entry: e.target.value})} />
            <input type="number" step="1" placeholder="Quantity" value={form.qty} onChange={e=>setForm({...form, qty: e.target.value})} />
          </div>
          <button onClick={add} className="w-full text-[11px] font-mono py-2 bg-fg text-bg hover:bg-muted">ADD POSITION</button>
        </div>
      )}
      <div className="space-y-3">
        {positions.length === 0 && (
          <div className="text-[11px] font-mono text-muted text-center py-8">No positions yet</div>
        )}
        {positions.map(p => (
          <PositionCard key={p.id} pos={p}
            earningsRow={earningsByTicker[p.ticker.toUpperCase()] || null}
            onUpdate={update} onRemove={remove} />
        ))}
      </div>
    </div>
  );
};

function App() {
  const [demo, setDemo] = useState(false);
  const [weekDate, setWeekDate] = useState(() => fmtISO(mondayOf(new Date())));
  const [selected, setSelected] = useState(null);
  const [mobileTab, setMobileTab] = useState('dashboard');
  const [tickNow, setTickNow] = useState(Date.now());

  const apiUrl = `/api/earnings?week=${weekDate}&demo=${demo}`;
  const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
    refreshInterval: demo ? 0 : 5 * 60 * 1000,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  useEffect(() => { if (data) setUpdatedAt(Date.now()); }, [data]);
  const ago = Math.max(0, Math.floor((tickNow - updatedAt) / 1000));

  const rows = data?.rows || [];

  useEffect(() => {
    if (rows.length && (!selected || !rows.find(r=>r.ticker===selected))) {
      setSelected(rows[0].ticker);
    }
  }, [rows, selected]);

  const selectedRow = rows.find(r => r.ticker === selected);
  const earningsByTicker = useMemo(() => Object.fromEntries(rows.map(r => [r.ticker, r])), [rows]);

  const goWeek = (delta) => {
    const d = new Date(weekDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta * 7);
    setWeekDate(fmtISO(d));
  };

  return (
    <div className="min-h-screen bg-bg text-fg">
      {demo && (
        <div className="bg-over/15 border-b border-over/40 text-over text-[11px] font-mono uppercase tracking-widest text-center py-2">
          DEMO MODE · synthetic data for illustration only
        </div>
      )}

      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="font-mono text-sm font-semibold tracking-tight text-fg">The Earnings Edge</div>
            <div className="hidden md:block text-[10px] font-mono text-muted uppercase tracking-widest">Implied vs Realized · Mispricing Scanner</div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => goWeek(-1)} className="font-mono text-xs text-muted hover:text-fg px-2">‹</button>
            <input type="date" value={weekDate} onChange={e => {
              const d = new Date(e.target.value + 'T00:00:00Z');
              setWeekDate(fmtISO(mondayOf(d)));
            }} className="text-xs" />
            <button onClick={() => goWeek(1)} className="font-mono text-xs text-muted hover:text-fg px-2">›</button>
            <span className="hidden md:inline text-[10px] font-mono text-muted ml-1">{data?.from} → {data?.to}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {!demo && <span className="pulse-dot"></span>}
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
                {demo ? 'DEMO' : isLoading ? 'LOADING' : `LIVE · UPDATED ${ago}s AGO`}
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Demo Mode</span>
              <span className={`w-9 h-5 border ${demo ? 'border-over' : 'border-border'} relative inline-block`}>
                <input type="checkbox" checked={demo} onChange={e=>setDemo(e.target.checked)} className="opacity-0 absolute inset-0 cursor-pointer" />
                <span className={`absolute top-0.5 ${demo ? 'right-0.5 bg-over' : 'left-0.5 bg-muted'} w-3.5 h-3.5 transition-all`}></span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="md:hidden border-b border-border">
        <div className="max-w-7xl mx-auto px-4 flex">
          {['dashboard', 'portfolio'].map(t => (
            <button key={t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 py-2 text-[10px] font-mono uppercase tracking-widest ${mobileTab === t ? 'text-fg border-b-2 border-fg' : 'text-muted'}`}>{t}</button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className={`${mobileTab === 'portfolio' ? 'hidden md:block' : 'block'} space-y-6`}>
          {isLoading ? (
            <div className="bg-surface border border-border p-6 h-44 flex items-center justify-center text-muted font-mono text-xs">Loading earnings calendar… first live run may take 30–60s</div>
          ) : error ? (
            <div className="bg-surface border border-over p-6 text-over font-mono text-xs">Error loading data</div>
          ) : rows.length === 0 ? (
            <div className="bg-surface border border-border p-12 text-center font-mono text-muted text-sm">
              No qualifying earnings this week.<br/>
              <span className="text-[11px]">Try a different week or toggle DEMO MODE.</span>
            </div>
          ) : (
            <Hero row={rows[0]} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <Leaderboard rows={rows} selected={selected} onSelect={setSelected} />
            </div>
            <div className="lg:col-span-4">
              <DetailPanel row={selectedRow} />
            </div>
            <div className="hidden lg:block lg:col-span-3">
              <Portfolio earningsByTicker={earningsByTicker} />
            </div>
          </div>

          {rows.length > 0 && <ScatterPanel rows={rows} />}
        </div>

        <div className={`${mobileTab === 'portfolio' ? 'block' : 'hidden'} lg:hidden`}>
          <Portfolio earningsByTicker={earningsByTicker} />
        </div>

        <div className="text-center text-[10px] font-mono text-muted py-4">
          Data: Finnhub earnings calendar · Yahoo Finance options &amp; prices · Cached 1h server-side
        </div>
      </main>
    </div>
  );
}

export default App;
