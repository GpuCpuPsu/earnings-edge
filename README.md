# The Earnings Edge

A professional dashboard that compares **implied earnings moves** (from current options pricing) against **realized earnings moves** (from the last quarters) for every U.S. stock reporting earnings this week — ranked by mispricing.

> Positive mispricing = options overpriced (sell vol). Negative = underpriced (buy vol).

## What it does

- Pulls this week's earnings calendar from **Finnhub** (free tier, 60 req/min)
- For each ticker with `reportDate >= today`, uses **yahoo-finance2** to:
  - Get the option expiry **immediately after** the earnings date
  - Find ATM call + put (closest strike to spot)
  - Compute `implied_move = ((mid_call + mid_put) / spot) * 100`
- Pulls historical earnings dates and OHLC, computes `realized_move = |close_after − close_before| / close_before * 100`
- Ranks by `mispricing_pp = implied_move − avg_realized`
- Renders a hero panel, leaderboard, detail panel, scatter plot, and **portfolio tracker** (localStorage)

## Stack

- Next.js 14 (App Router, JavaScript)
- Tailwind CSS (custom palette, no defaults — no gradients, no emoji, no SaaS pastels)
- Recharts (with all default styling overridden)
- SWR (client cache) + 1-hour server-side in-memory cache
- `yahoo-finance2` for options + historical prices
- Finnhub for earnings calendar + historical earnings dates

## Run it yourself

### 1. Get a free Finnhub key

Register at https://finnhub.io/register (no credit card). Copy your API key.

### 2. Install + configure

```bash
git clone <your-repo-url>
cd <repo>
yarn install

# create .env in project root
cat > .env <<EOF
FINNHUB_API_KEY=your_key_here
MONGO_URL=mongodb://localhost:27017
NEXT_PUBLIC_BASE_URL=http://localhost:3000
EOF
```

> Note: MongoDB is included in the template but **not used** by this app. The line is harmless.
> Node ≥ 22 is recommended by `yahoo-finance2`; Node 20 works but prints a warning.

### 3. Dev

```bash
yarn dev
# http://localhost:3000
```

### 4. Production

```bash
yarn build
yarn start
```

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | `{ ok, hasKey }` |
| `GET /api/earnings?week=YYYY-MM-DD` | Live earnings mispricing for the week containing the given Monday. First call ~30–60s, cached 1h. |
| `GET /api/earnings?demo=true&week=...` | Deterministic demo data (>10pp overpriced anchor + <−5pp underpriced anchor). |
| `GET /api/quote?symbol=AAPL` | Live mid quote for portfolio shares. |
| `GET /api/option?symbol=&strike=&expiry=&type=call\|put` | Live option mid for portfolio options. |

## Data integrity rules

1. Only tickers with `reportDate >= today` (no already-reported companies).
2. Both ATM legs must have **live** `bid > 0` AND `ask > 0`. No `lastPrice` fallback.
3. LIVE mode never returns synthetic data. Empty week → `rows: []`.
4. All `null` values handled — no crashes on weeks with missing data.

## Demo mode

- OFF by default.
- Toggle in the top bar.
- When ON, banner shows: `DEMO MODE · synthetic data for illustration only`.
- Data varies deterministically per week so the UI is testable without market hours.

## Design system (strict)

| Token | Value |
|---|---|
| Background | `#0A0A0B` |
| Card surface | `#131316` |
| Border | `#26262A` |
| Primary text | `#F4F4F5` |
| Secondary text | `#71717A` |
| Overpriced | `#EF4444` |
| Underpriced | `#10B981` |
| UI font | Inter |
| Numbers/tickers | JetBrains Mono (tabular-nums) |

**No gradients, no glassmorphism, no heavy shadows, no `rounded-3xl`, no emoji, no default Tailwind blue/purple/pink, no glowing effects, no chart entry animations.**

## Project structure

```
app/
├── api/[[...path]]/route.js   # all backend endpoints
├── page.js                    # the entire dashboard
├── layout.js
└── globals.css                # font imports + Recharts overrides
tailwind.config.js             # custom palette
.env                           # FINNHUB_API_KEY
```

## License

MIT — yours to use, modify, ship.
