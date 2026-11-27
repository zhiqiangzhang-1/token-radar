# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zhiqiangzhang-1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zhiqiangzhang-1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: 226 pre-token protocols ranked by implied value, priced from the market's own multiples. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program reads the sealed snapshot (`/input/snapshot.json` in the grader, or `--input` locally), fits its valuation model from the snapshot's own live-token protocols — a log-log regression of market cap on TVL, blended with each category's own median mcap/TVL (size-adjusted, weighted by sample size) — and writes the ranked board to `/output/board.json`, the dashboard data to `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json` with the vendored make.fun library.

A sensitivity check on the fit: dropping the ten most extreme live tokens leaves 28 of the top 30 in place, while a mid-board rank can move by as much as 48 places — the top of the board is stable, the middle is not, and the fit is a rough pricing guide, not a prediction.

Open `dashboard/index.html` (with `data.js` beside it) for the board: sortable and filterable, a detail view with the model breakdown and a six-step farm plan per protocol, and the 24 largest live-token protocols the curve is fitted from.

---

<sub>Entered on [make.fun](https://make.fun/?ref=bright-coyote-55&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
