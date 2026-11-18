// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the floor with the most TVL: the early rows the radar exists to find. A
// protocol is pre-token when its DefiLlama record carries no token (no market cap, no CoinGecko id,
// no symbol). Live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board.
//
// Implied value is fitted from the snapshot itself at run time, never from a hardcoded list of
// names, in three steps:
//
//   1. Size curve. Across the snapshot's live-token protocols (those with a market cap and a TVL),
//      log(market cap) is regressed on log(TVL) by ordinary least squares. The fit on this
//      snapshot is log(mcap) = 6.96 + 0.52 * log(tvl) over 128 protocols: the market pays a
//      multiple of TVL that falls as TVL grows (about 0.67x at $5M of TVL, 0.22x at $50M, 0.05x
//      at $1B). A pre-token protocol's base value is the curve's prediction at its own TVL.
//   2. Category factor. For each category with at least three live-token peers, the median
//      log-residual of those peers against the curve is shrunk by n/(n+3) toward zero and
//      exponentiated, clamped to [0.5, 2.0]. Categories with fewer than three peers get no
//      adjustment: one or two observations are not evidence. Lending peers sit below the curve
//      (factor 0.63), RWA and bridges above it (1.38 and 1.36-2.00).
//   3. Small, stated adjustments: 7-day TVL momentum, clamped to [-60, +120]%, at half weight;
//      maturity 0.70 + 0.30 * min(age, 1095)/1095 (unknown listing date counts as 365 days);
//      reach 1 + 0.03 * (min(chains, 5) - 1). Every adjustment is bounded, so no single input
//      can dominate the ranking.
//
// The fit is deliberately rough: the log-residuals of live tokens spread widely (standard
// deviation about 2.1 in log terms), so an implied value is a central estimate from the market's
// own pricing, not a prediction of what any token will be worth. The dashboard says so.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve: log(mcap) = intercept + slope * log(tvl). */
export interface SizeCurve {
  intercept: number;
  slope: number;
  n: number;
  residual_sd: number;
}

/** One category's adjustment from its live-token peers. */
export interface CategoryFactor {
  category: string;
  factor: number;
  peers: number;
  median_residual: number;
}

/** The model's structural choices: the only numbers not fitted from the snapshot. */
export interface ModelParams {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
  factor_min: number;
  factor_max: number;
  min_peers: number;
}

export const PARAMS: ModelParams = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.03,
  chain_cap: 5,
  factor_min: 0.5,
  factor_max: 2.0,
  min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_value: number;
    size_multiple: number;
    category_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chains_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  size_multiple: number;
  category_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chains_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the fitted model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  params: ModelParams;
  curve: SizeCurve;
  category_factors: CategoryFactor[];
  watchlist_size: number;
  watchlist_slugs: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Live-token protocols usable for the fit: a market cap and a TVL, both positive. */
export function fittable(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The size curve, fitted at run time from the snapshot's own live-token protocols: ordinary least
 * squares of log(market cap) on log(TVL). Deterministic for a fixed input.
 */
export function fitSizeCurve(live: SnapshotProtocol[]): SizeCurve {
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const residuals = live.map((p) => Math.log(p.mcap_usd!) - (intercept + slope * Math.log(p.tvl_usd)));
  const rmean = residuals.reduce((a, b) => a + b, 0) / n;
  const residual_sd = Math.sqrt(residuals.reduce((a, r) => a + (r - rmean) * (r - rmean), 0) / n);
  return { intercept, slope, n, residual_sd };
}

/**
 * Category factors from the same live peers: per category, the median log-residual against the
 * curve, shrunk by n/(n+3) toward zero, exponentiated and clamped. Categories with fewer than
 * PARAMS.min_peers peers get no factor (1.0): too little evidence to adjust.
 */
export function fitCategoryFactors(live: SnapshotProtocol[], curve: SizeCurve, params: ModelParams = PARAMS): CategoryFactor[] {
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const resid = Math.log(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log(p.tvl_usd));
    const key = p.category ?? 'Uncategorized';
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [resid]);
    else list.push(resid);
  }
  const out: CategoryFactor[] = [];
  for (const [category, residuals] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (residuals.length < params.min_peers) continue;
    const med = median(residuals);
    const shrunk = med * (residuals.length / (residuals.length + 3));
    const factor = Math.min(params.factor_max, Math.max(params.factor_min, Math.exp(shrunk)));
    out.push({ category, factor: Math.round(factor * 1000) / 1000, peers: residuals.length, median_residual: Math.round(med * 1000) / 1000 });
  }
  return out;
}

/** The fitted model as one object, for the dashboard to state. */
export interface FittedModel {
  curve: SizeCurve;
  category_factors: CategoryFactor[];
  factorOf: (category: string | null) => number;
}

export function fitModel(snapshot: Snapshot, params: ModelParams = PARAMS): FittedModel {
  const live = fittable(snapshot.protocols);
  const curve = fitSizeCurve(live);
  const category_factors = fitCategoryFactors(live, curve, params);
  const table = new Map(category_factors.map((f) => [f.category, f.factor]));
  return { curve, category_factors, factorOf: (c) => table.get(c ?? 'Uncategorized') ?? 1 };
}

/** The multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: FittedModel,
  params: ModelParams = PARAMS,
): { implied: number; base: number; multiple: number; catFactor: number; growthPct: number; growthMult: number; maturityMult: number; chainsMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = Math.exp(model.curve.intercept) * Math.pow(protocol.tvl_usd, model.curve.slope - 1);
  const base = protocol.tvl_usd * multiple;
  const catFactor = model.factorOf(protocol.category);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(params.growth_cap, Math.max(params.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * params.growth_weight;
  const ageForModel = age ?? params.unknown_age_days;
  const maturityMult = params.maturity_floor + (Math.min(Math.max(ageForModel, 0), params.maturity_days) / params.maturity_days) * params.maturity_range;
  const chainsMult = 1 + params.chain_step * (Math.min(protocol.chains.length, params.chain_cap) - 1);
  const implied = Math.max(1, Math.round(base * catFactor * growthMult * maturityMult * chainsMult));
  return { implied, base: Math.round(base), multiple, catFactor, growthPct, growthMult, maturityMult, chainsMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: FittedModel, params: ModelParams = PARAMS): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model, params) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      base_value: s.v.base,
      size_multiple: round4(s.v.multiple),
      category_factor: s.v.catFactor,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chains_multiplier: round4(s.v.chainsMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** A deterministic 0..n-1 pick from a slug, so similar protocols still read differently. */
function pick(slug: string, n: number): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % n;
}

/**
 * One category's farm profile: what the product is and what a farmer actually does with it. The
 * profile is keyed on the category's words, never on a protocol's name: the same rules score and
 * describe every row, and the chain, capital and holding period come from that row's own record.
 */
interface FarmProfile {
  core: string;
  second: string[];
  weekly: string;
  watch: string;
}

const PROFILES: [RegExp, FarmProfile][] = [
  [
    /risk curator|onchain capital|curator|allocator/i,
    {
      core: 'Deposit $${capital} into a {name} vault on {chain} and read the vault strategy page first so you know what the curator does with it',
      second: [
        'Allocate a second, smaller deposit to a different {name} vault so the wallet shows two vaults, not one',
        'Vote on a {name} curator proposal or reallocate between two of its vaults',
      ],
      weekly: 'rebalance a small amount between two {name} vaults',
      watch: 'the vault page for strategy changes and the curator fee it charges',
    },
  ],
  [
    /rwa/i,
    {
      core: 'Buy or mint $${capital} of the tokenized real-world asset {name} offers on {chain}, after reading the issuer and redemption terms on its own page',
      second: [
        'Hold the asset through one full yield payout and record the date it lands',
        'Redeem a small test amount back to stablecoins to confirm the redemption path works',
      ],
      weekly: 'check the asset price and any new issuance {name} lists',
      watch: 'the issuer page for redemption windows and the asset’s backing report',
    },
  ],
  [
    /lend|collateral markets/i,
    {
      core: 'Supply $${capital} of USDC to {name} on {chain} as collateral and keep the position open',
      second: [
        'Borrow a small amount against the collateral, then repay it the same week so the wallet shows both sides of the market',
        'Supply a second asset, such as wrapped ETH, to a different {name} market on {chain}',
      ],
      weekly: 'adjust the collateral or repay a small part of a borrow on {name}',
      watch: 'your health factor and the borrow rate on {name}',
    },
  ],
  [
    /cdp|stablecoin/i,
    {
      core: 'Lock $${capital} of collateral in {name} on {chain} and mint its stable asset, keeping the collateral ratio well above the liquidation line',
      second: [
        'Repay part of the minted stable asset, then mint again, so the wallet shows a full borrow cycle',
        'Provide the minted stable asset to a {name} stability pool on {chain}',
      ],
      weekly: 'top up collateral or repay a little of the minted amount on {name}',
      watch: 'the collateral ratio and the stable asset’s peg on {name}',
    },
  ],
  [
    /dex|liquidity manager/i,
    {
      core: 'Provide $${capital} of liquidity to {name}’s main pool on {chain}, in the pair its own page lists as the deepest',
      second: [
        'Swap a small amount through {name} on {chain} in both directions so the wallet shows swaps as well as liquidity',
        'Move the position into a different {name} fee tier for one week, then move it back',
      ],
      weekly: 'swap a small amount or collect fees on {name}',
      watch: 'the pool page for fees earned and impermanent loss on {name}',
    },
  ],
  [
    /yield|leveraged farm/i,
    {
      core: 'Deposit $${capital} into {name}’s main yield position on {chain} and keep it staked',
      second: [
        'Compound the yield once, restaking the rewards back into the same {name} position',
        'Open a second, smaller {name} position in a different pool on {chain}',
      ],
      weekly: 'claim and restake a small amount of yield on {name}',
      watch: 'the position page for the yield rate and any lock-up it carries',
    },
  ],
  [
    /basis trading/i,
    {
      core: 'Deposit $${capital} into {name}’s basis vault on {chain} and read how it earns the funding-rate spread before you deposit',
      second: [
        'Hold the vault position through one funding-rate cycle and record the payout',
        'Withdraw a small test amount to confirm the vault’s exit works',
      ],
      weekly: 'check the funding rate {name} is capturing',
      watch: 'the vault page for funding-rate changes and withdrawal delays',
    },
  ],
  [
    /liquid staking|restak|staking pool/i,
    {
      core: 'Stake $${capital} of the chain’s staking asset through {name} on {chain} and keep the receipt token in the same wallet',
      second: [
        'Use the receipt token in one {name}-supported pool on {chain}, then return it to the wallet',
        'Restake the receipt token through {name} a second time if its page offers it',
      ],
      weekly: 'check the staking rewards the receipt token has earned',
      watch: 'the staking page for the exchange rate of the receipt token',
    },
  ],
  [
    /bridge|canonical bridge|cross chain/i,
    {
      core: 'Bridge $${capital} of USDC to {chain} through {name} and use the bridged funds in an app on the destination chain',
      second: [
        'Bridge a smaller amount back the other way so the wallet shows both directions',
        'Bridge to a second destination chain {name} supports and hold the funds there for a week',
      ],
      weekly: 'bridge a small amount through {name} to a chain you already use',
      watch: 'the bridge page for fees and the time a transfer takes',
    },
  ],
  [
    /derivative|perpetual/i,
    {
      core: 'Deposit $${capital} of USDC as margin on {name} and open one small hedged position, sized so a sharp move cannot liquidate it',
      second: [
        'Close the position, then open a second one in the opposite direction with a smaller size',
        'Place one limit order on {name} and let it fill or expire on its own',
      ],
      weekly: 'open and close one small hedged position on {name}',
      watch: 'your margin, the funding rate and the liquidation price on {name}',
    },
  ],
  [
    /^chain$/i,
    {
      core: 'Bridge $${capital} of USDC to the {name} chain and use it in one of the chain’s own apps, keeping the funds on the chain',
      second: [
        'Swap a small amount on the chain’s main dex and hold the received asset for a week',
        'Try a second native app on {name} with a small amount',
      ],
      weekly: 'make one transaction in a native app on {name}',
      watch: 'the chain’s own explorer for your transaction history',
    },
  ],
  [
    /payment/i,
    {
      core: 'Pay $${capital} through {name} on {chain} for something you would buy anyway, using its own checkout or card flow',
      second: [
        'Receive one payment through {name} into the same wallet',
        'Set up a recurring payment through {name} for a small weekly amount',
      ],
      weekly: 'make one real payment through {name}',
      watch: 'the payments page for settlement times and fees',
    },
  ],
  [
    /insurance/i,
    {
      core: 'Buy $${capital} of cover from {name} on {chain} for a position you already hold, and read what the policy excludes',
      second: [
        'Buy a second, smaller cover for a different risk {name} lists',
        'File a test claim inquiry through {name}’s own page to learn the process, without filing a false claim',
      ],
      weekly: 'check the cover’s expiry and the premium {name} charges',
      watch: 'the policy page for expiry dates and claim conditions',
    },
  ],
  [
    /prediction/i,
    {
      core: 'Fund $${capital} and place one position on a {name} market you have actually read, on {chain}',
      second: [
        'Take the opposite side of a small market on {name} to show both directions',
        'Provide liquidity to a {name} market instead of taking a side',
      ],
      weekly: 'settle or close one position on {name}',
      watch: 'your open positions and the market’s resolution rules',
    },
  ],
  [
    /governance/i,
    {
      core: 'Deposit $${capital} into {name} on {chain} and delegate or vote with the position on a live proposal',
      second: [
        'Vote on a second {name} proposal from the same wallet',
        'Join a {name} discussion thread and post one substantive comment',
      ],
      weekly: 'vote on any new {name} proposal that opens',
      watch: 'the governance page for new proposals and voting deadlines',
    },
  ],
  [
    /index/i,
    {
      core: 'Buy $${capital} of the {name} index on {chain} and hold the index token in the wallet',
      second: [
        'Rebalance the index position once through {name}’s own page',
        'Mint the index with its underlying assets instead of buying it outright',
      ],
      weekly: 'check the index composition {name} publishes',
      watch: 'the index page for rebalances and fees',
    },
  ],
  [
    /launchpad/i,
    {
      core: 'Stake $${capital} through {name} on {chain} to qualify for its launches and join one sale with a small allocation',
      second: [
        'Claim the allocation from the sale and hold it for a week',
        'Join a second {name} launch with a smaller allocation',
      ],
      weekly: 'check which launches {name} has open',
      watch: 'the launchpad page for sale dates and allocation rules',
    },
  ],
  [
    /option/i,
    {
      core: 'Deposit $${capital} as collateral on {name} and buy one small option on {chain}, sized so the most you can lose is the premium',
      second: [
        'Sell one covered option on {name} against an asset you hold',
        'Close the option before expiry and record the result',
      ],
      weekly: 'review open option positions on {name}',
      watch: 'expiry dates and implied volatility on {name}',
    },
  ],
];

const DEFAULT_PROFILE: FarmProfile = {
  core: 'Deposit $${capital} of USDC into {name} on {chain} and keep the position open',
  second: [
    'Make a second, smaller deposit into a different {name} product on {chain}',
    'Use one more feature of {name} on {chain}, such as a swap or a vote, from the same wallet',
  ],
  weekly: 'repeat one qualifying action on {name}',
  watch: 'the protocol page for points, rewards or changes to its terms',
};

function profileFor(p: SnapshotProtocol): FarmProfile {
  const c = p.category ?? '';
  for (const [re, profile] of PROFILES) {
    if (re.test(c)) return profile;
  }
  return DEFAULT_PROFILE;
}

function fill(template: string, p: SnapshotProtocol, capital: number, chain: string): string {
  return template.replaceAll('${capital}', String(capital)).replaceAll('{name}', p.name).replaceAll('{chain}', chain);
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step says what to do, what it costs and how long it takes, and the last step says
 * plainly that DefiLlama's record lists no token for this protocol, so nothing here promises an
 * airdrop or any return.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const profile = profileFor(p);
  const second = profile.second[pick(p.slug, profile.second.length)]!;
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Send a $10 test deposit to ${p.name} on ${chain} first and confirm it lands before the full amount.`,
      cost: 'under $3 of gas for the first transaction',
      time: '15 minutes',
    },
    {
      text: `${fill(profile.core, p, capital, chain)}.`,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${fill(second, p, capital, chain)}.`,
      cost: `about $${Math.max(2, Math.round(capital / 25))} of gas`,
      time: '15 minutes',
    },
    {
      text: `Make one qualifying action each week, such as ${fill(profile.weekly, p, capital, chain)}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and check ${fill(profile.watch, p, capital, chain)} once a week.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `If ${p.name} ever opens a claim, use only the link its own site or official account publishes, never pay to claim, and never sign an approval you have not read. DefiLlama's record lists no token for ${p.name}, so nothing here promises an airdrop or any return.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with its farm plan. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    size_multiple: row.model.size_multiple,
    category_factor: row.model.category_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chains_multiplier: row.model.chains_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, params: ModelParams = PARAMS): { board: BoardRow[]; radar: RadarData } {
  const model = fitModel(snapshot, params);
  const board = buildBoard(snapshot, model, params);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    params,
    curve: model.curve,
    category_factors: model.category_factors,
    watchlist_size: snapshot.watchlist.length,
    watchlist_slugs: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
