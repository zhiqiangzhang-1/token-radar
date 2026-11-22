// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the watchlist floor with the most TVL: the early rows the radar exists to find. A
// protocol is pre-token when its DefiLlama record carries no token (no market cap, no CoinGecko id,
// no symbol). Live-token protocols are kept apart and shown as the market's own values, never mixed
// into the ranked board.
//
// Implied value is fitted from the snapshot itself at run time, never from a hardcoded list of
// names, in three steps (model radar-3, a hybrid of category multiples and the global curve):
//
//   1. Size curve. Across the snapshot's live-token protocols (those with a market cap and a TVL),
//      log(market cap) is regressed on log(TVL) by ordinary least squares. The fit on this
//      snapshot is log(mcap) = 6.96 + 0.52 * log(tvl) over 128 protocols: the market pays a
//      multiple of TVL that falls as TVL grows (about 0.67x at $5M of TVL, 0.22x at $50M, 0.05x
//      at $1B). The curve gives the global multiple at any TVL.
//   2. Category multiple, size-adjusted and blended. For each category with at least three
//      live-token peers, the median mcap/TVL of those peers is moved to the protocol's own TVL
//      along the curve's size slope, then blended with the global multiple in log space, the
//      weight on the category being n/(n+4) so thin categories lean on the curve and thick ones
//      speak for themselves. The blended multiple is kept within 0.15x-3.0x of the global one,
//      so no thin category can run away with a row. Categories with fewer than three peers get
//      the global multiple alone: one or two observations are not evidence. This replaces the
//      radar-2 fit, whose category factor was clamped to [0.50, 2.00] and left liquid-staking
//      rows priced about 4-7x above what their own peers trade at, while capping bridges at
//      2.00x when their peers trade nearer 2.5x of the curve.
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

/** One category's multiple from its live-token peers: median mcap/TVL and their median TVL. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  median_multiple: number;
  median_tvl_usd: number;
  weight: number;
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
  blend_k: number;
  ratio_min: number;
  ratio_max: number;
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
  blend_k: 4,
  ratio_min: 0.15,
  ratio_max: 3.0,
  min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/**
 * How many pre-token protocols below the watchlist floor the early radar carries, by TVL.
 * 186 is every rankable one the snapshot holds (40 watchlist + 186 = 226 rows); the 24 below-floor
 * pre-token protocols left out are CEX rows and versioned pools, excluded on purpose.
 */
export const EARLY_ROWS = 186;

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
    global_multiple: number;
    category_multiple: number | null;
    category_factor: number;
    category_weight: number;
    category_peers: number;
    category_median_multiple: number | null;
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
  global_multiple: number;
  category_multiple: number | null;
  category_factor: number;
  category_weight: number;
  category_peers: number;
  category_median_multiple: number | null;
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
  category_multiples: CategoryMultiple[];
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
 * Category multiples from the same live peers: per category with at least PARAMS.min_peers peers,
 * the median mcap/TVL and the peers' median TVL, with the blend weight n/(n+blend_k). Categories
 * with fewer peers get no row: too little evidence to adjust. A median multiple is size-blind on
 * its own, so the blend moves it to the protocol's TVL along the curve's slope (see multipleFor).
 */
export function fitCategoryMultiples(live: SnapshotProtocol[], params: ModelParams = PARAMS): CategoryMultiple[] {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [p]);
    else list.push(p);
  }
  const out: CategoryMultiple[] = [];
  for (const [category, peers] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (peers.length < params.min_peers) continue;
    const medMult = median(peers.map((p) => p.mcap_usd! / p.tvl_usd));
    const medTvl = median(peers.map((p) => p.tvl_usd));
    const weight = Math.round((peers.length / (peers.length + params.blend_k)) * 1000) / 1000;
    out.push({ category, peers: peers.length, median_multiple: Math.round(medMult * 10000) / 10000, median_tvl_usd: Math.round(medTvl), weight });
  }
  return out;
}

/** One protocol's multiple under the hybrid: global, size-adjusted category, and the blend. */
export interface ProtocolMultiple {
  global: number;
  category: number | null;
  blended: number;
  factor: number;
  weight: number;
  peers: number;
  median_multiple: number | null;
}

/** The fitted model as one object, for the dashboard to state. */
export interface FittedModel {
  curve: SizeCurve;
  category_multiples: CategoryMultiple[];
  multipleFor: (protocol: SnapshotProtocol) => ProtocolMultiple;
}

export function fitModel(snapshot: Snapshot, params: ModelParams = PARAMS): FittedModel {
  const live = fittable(snapshot.protocols);
  const curve = fitSizeCurve(live);
  const category_multiples = fitCategoryMultiples(live, params);
  const table = new Map(category_multiples.map((f) => [f.category, f]));
  const multipleFor = (p: SnapshotProtocol): ProtocolMultiple => {
    const global = Math.exp(curve.intercept) * Math.pow(p.tvl_usd, curve.slope - 1);
    const entry = table.get(p.category ?? 'Uncategorized');
    if (entry === undefined) {
      return { global, category: null, blended: global, factor: 1, weight: 0, peers: 0, median_multiple: null };
    }
    // Move the category's median multiple to this protocol's size along the curve's slope:
    // multiples fall as TVL grows, so a category median taken at $20M of TVL must not price a $376M protocol.
    const sizeAdjusted = entry.median_multiple * Math.pow(p.tvl_usd / entry.median_tvl_usd, curve.slope - 1);
    const blendedRaw = Math.exp(entry.weight * Math.log(sizeAdjusted) + (1 - entry.weight) * Math.log(global));
    const ratio = Math.min(params.ratio_max, Math.max(params.ratio_min, blendedRaw / global));
    return { global, category: sizeAdjusted, blended: global * ratio, factor: ratio, weight: entry.weight, peers: entry.peers, median_multiple: entry.median_multiple };
  };
  return { curve, category_multiples, multipleFor };
}

/** The multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: FittedModel,
  params: ModelParams = PARAMS,
): {
  implied: number;
  base: number;
  multiple: number;
  globalMultiple: number;
  categoryMultiple: number | null;
  categoryFactor: number;
  categoryWeight: number;
  categoryPeers: number;
  categoryMedianMultiple: number | null;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainsMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const m = model.multipleFor(protocol);
  const base = protocol.tvl_usd * m.blended;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(params.growth_cap, Math.max(params.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * params.growth_weight;
  const ageForModel = age ?? params.unknown_age_days;
  const maturityMult = params.maturity_floor + (Math.min(Math.max(ageForModel, 0), params.maturity_days) / params.maturity_days) * params.maturity_range;
  const chainsMult = 1 + params.chain_step * (Math.min(protocol.chains.length, params.chain_cap) - 1);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainsMult));
  return {
    implied,
    base: Math.round(base),
    multiple: m.blended,
    globalMultiple: m.global,
    categoryMultiple: m.category,
    categoryFactor: m.factor,
    categoryWeight: m.weight,
    categoryPeers: m.peers,
    categoryMedianMultiple: m.median_multiple,
    growthPct,
    growthMult,
    maturityMult,
    chainsMult,
    age,
  };
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
      global_multiple: round4(s.v.globalMultiple),
      category_multiple: s.v.categoryMultiple === null ? null : round4(s.v.categoryMultiple),
      category_factor: round4(s.v.categoryFactor),
      category_weight: s.v.categoryWeight,
      category_peers: s.v.categoryPeers,
      category_median_multiple: s.v.categoryMedianMultiple,
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

/** The gas token of a chain, for the fee note in the first step; unknown chains stay generic. */
function gasToken(chain: string): string {
  // A full phrase, so the sentence reads with or without a known ticker: "keep a little ETH
  // in the wallet for fees" or "keep enough of the chain's native gas token in the wallet".
  const map: Record<string, string> = {
    Ethereum: 'a little ETH', Arbitrum: 'a little ETH', Optimism: 'a little ETH', Base: 'a little ETH',
    Ink: 'a little ETH', Linea: 'a little ETH', 'zkSync Era': 'a little ETH', Scroll: 'a little ETH',
    Blast: 'a little ETH', Mode: 'a little ETH', Fraxtal: 'a little ETH', Manta: 'a little ETH',
    Zora: 'a little ETH', 'World Chain': 'a little ETH', Unichain: 'a little ETH', Gnosis: 'a little xDAI',
    Polygon: 'a little POL', Solana: 'a little SOL', Binance: 'a little BNB', opBNB: 'a little BNB',
    Avalanche: 'a little AVAX', Sui: 'a little SUI', Tron: 'a little TRX', Bitcoin: 'a little BTC',
    BSquared: 'a little BTC', BOB: 'a little BTC', Merlin: 'a little BTC', Rootstock: 'a little BTC',
    Berachain: 'a little BERA', 'Hyperliquid L1': 'a little HYPE', 'Plume Mainnet': 'a little PLUME',
    Stellar: 'a little XLM', Algorand: 'a little ALGO', Flare: 'a little FLR', CORE: 'a little CORE',
    Sei: 'a little SEI', Aptos: 'a little APT', Near: 'a little NEAR', Cosmos: 'a little ATOM',
    Osmosis: 'a little OSMO', Fantom: 'a little FTM', Cronos: 'a little CRO', Monad: 'a little MON',
    Sonic: 'a little S', Bittensor: 'a little TAO', Plasma: 'a little XPL', Mantle: 'a little MNT',
    Starknet: 'a little STRK', TON: 'a little TON', Ronin: 'a little RON', Kava: 'a little KAVA',
    Chiliz: 'a little CHZ', Stacks: 'a little STX', XDC: 'a little XDC', Klaytn: 'a little KLAY',
    Ripple: 'a little XRP', WEMIX: 'a little WEMIX', Qubic: 'a little QUBIC', Mixin: 'a little XIN',
    ZIGChain: 'a little ZIG', 'Bifrost Network': 'a little BNC', RSK: 'a little RBTC',
    Proton: 'a little XPR', Provenance: 'a little HASH', Canton: 'a little CC',
  };
  return map[chain] ?? 'enough of the chain’s native gas token';
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

/** A deterministic 0..n-1 pick from a key string, so similar protocols still read differently. */
function pick(key: string, n: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % n;
}

/**
 * One category's farm profile: what the product is and what a farmer actually does with it. The
 * profile is keyed on the category's words, never on a protocol's name: the same rules score and
 * describe every row, and the chain, capital and holding period come from that row's own record.
 * Each profile carries two core wordings, three second actions, three weekly actions, two watch
 * wordings and one caution, picked deterministically per slug so no two rows read alike.
 */
interface FarmProfile {
  core: string[];
  second: string[];
  weekly: string[];
  watch: string[];
  caution: string;
}

const PROFILES: [RegExp, FarmProfile][] = [
  [
    /risk curator|onchain capital|curator|allocator/i,
    {
      core: [
        'Deposit $${capital} into {a} {name} vault on {chain} and read the vault strategy page first so you know what the curator does with it',
        'Allocate $${capital} to {a} {name} vault on {chain} after reading which assets the curator puts the vault into and what fee it charges',
      ],
      second: [
        'Allocate a second, smaller deposit to a different {name} vault so the wallet shows two vaults, not one',
        'Vote on {a} {name} curator proposal or reallocate between two of its vaults',
        'Move a small part of the deposit to a second {name} vault with a different strategy',
      ],
      weekly: ['rebalance a small amount between two {name} vaults', 'check which {name} vaults changed strategy this week', 'move a small amount into the {name} vault with the newest strategy'],
      watch: ['the {name} vault page for strategy changes and the curator fee it charges', 'the {name} vault page for new strategies the curator opens'],
      caution: 'Curators move funds between strategies, so read the vault page before every deposit and never treat a vault as a savings account.',
    },
  ],
  [
    /rwa/i,
    {
      core: [
        'Buy or mint $${capital} of the tokenized real-world asset {name} offers on {chain}, after reading the issuer and redemption terms on its own page',
        'Put $${capital} into {name}’s tokenized asset on {chain} once you have read the issuer, the backing and the redemption terms on its own page',
      ],
      second: [
        'Hold the {name} asset through one full yield payout and record the date it lands',
        'Redeem a small test amount of the {name} asset back to stablecoins to confirm the redemption path works',
        'Buy a second, smaller RWA position {name} lists on {chain}',
      ],
      weekly: ['check the asset price and any new issuance {name} lists', 'check the yield payout {name} has scheduled', 'review the backing report {name} publishes'],
      watch: ['the {name} issuer page for redemption windows and the asset’s backing report', 'the {name} issuer page for new asset listings and redemption dates'],
      caution: 'Redemption is the risk: confirm the window, the minimum and the fee before you deposit, and never assume an RWA redeems instantly.',
    },
  ],
  [
    /lend|collateral markets/i,
    {
      core: [
        'Supply $${capital} of USDC to {name} on {chain} as collateral and keep the position open',
        'Lend $${capital} of USDC on {name} on {chain} and leave the supply position open',
      ],
      second: [
        'Borrow a small amount against the {name} collateral, then repay it the same week so the wallet shows both sides of the market',
        'Supply a second asset, such as wrapped ETH, to a different {name} market on {chain}',
        'Repay the {name} borrow in full, then borrow a smaller amount again',
      ],
      weekly: ['adjust the collateral or repay a small part of a borrow on {name}', 'check the supply rate {name} pays and top up the position', 'repay a little of any borrow on {name}'],
      watch: ['your health factor and the borrow rate on {name}', 'the borrow rate and your health factor on {name}'],
      caution: 'Watch the health factor every week: if it drifts toward liquidation, add collateral or repay before the market moves, not after.',
    },
  ],
  [
    /cdp|stablecoin/i,
    {
      core: [
        'Lock $${capital} of collateral in {name} on {chain} and mint its stable asset, keeping the collateral ratio well above the liquidation line',
        'Deposit $${capital} of collateral into {name} on {chain}, mint a modest amount of its stable asset and keep the ratio comfortably above liquidation',
      ],
      second: [
        'Repay part of the stable asset {name} minted, then mint again, so the wallet shows a full borrow cycle',
        'Provide the minted stable asset to {a} {name} stability pool on {chain}',
        'Swap a small part of the stable asset {name} minted for USDC on {chain} and hold the rest',
      ],
      weekly: ['top up collateral or repay a little of the minted amount on {name}', 'check the peg of the stable asset {name} mints', 'adjust the collateral ratio on {name} if the market moved'],
      watch: ['the collateral ratio and the stable asset’s peg on {name}', 'the stability pool rate and the peg on {name}'],
      caution: 'Mint less than the maximum: a collateral ratio near the line is one price swing from liquidation.',
    },
  ],
  [
    /dex|liquidity manager/i,
    {
      core: [
        'Provide $${capital} of liquidity to {name}’s main pool on {chain}, in the pair its own page lists as the deepest',
        'Add $${capital} of liquidity to the deepest {name} pool on {chain}, in the pair its own page lists first',
      ],
      second: [
        'Swap a small amount through {name} on {chain} in both directions so the wallet shows swaps as well as liquidity',
        'Move the position into a different {name} fee tier for one week, then move it back',
        'Collect the fees the {name} position earned and add them back to the pool',
      ],
      weekly: ['swap a small amount or collect fees on {name}', 'check the fees the {name} position earned', 'rebalance the {name} position if its range drifted'],
      watch: ['the pool page for fees earned and impermanent loss on {name}', 'the pool page for the fee tier and the range on {name}'],
      caution: 'Liquidity earns fees but loses to price moves: check impermanent loss on the pool page before adding more.',
    },
  ],
  [
    /yield|leveraged farm/i,
    {
      core: [
        'Deposit $${capital} into {name}’s main yield position on {chain} and keep it staked',
        'Stake $${capital} in {name}’s main yield position on {chain} and leave it compounding',
      ],
      second: [
        'Compound the yield once, restaking the rewards back into the same {name} position',
        'Open a second, smaller {name} position in a different pool on {chain}',
        'Claim the yield once and restake it through {name}’s own page',
      ],
      weekly: ['claim and restake a small amount of yield on {name}', 'check the yield rate {name} pays', 'compound the yield {name} paid this week'],
      watch: ['the {name} position page for the yield rate and any lock-up it carries', 'the {name} position page for the reward token and its lock-up'],
      caution: 'Read the lock-up before you deposit: yield that cannot be withdrawn for weeks is not the same as yield you can claim.',
    },
  ],
  [
    /basis trading/i,
    {
      core: [
        'Deposit $${capital} into {name}’s basis vault on {chain} and read how it earns the funding-rate spread before you deposit',
        'Put $${capital} into {name}’s basis vault on {chain} after reading how it captures the funding-rate spread',
      ],
      second: [
        'Hold the {name} vault position through one funding-rate cycle and record the payout',
        'Withdraw a small test amount to confirm the {name} vault’s exit works',
        'Check the funding rate {name} captured this week and record it',
      ],
      weekly: ['check the funding rate {name} is capturing', 'check the {name} vault’s payout for the week', 'review the basis spread {name} is earning'],
      watch: ['the {name} vault page for funding-rate changes and withdrawal delays', 'the {name} vault page for the funding rate and any withdrawal queue'],
      caution: 'A basis vault earns when funding is positive and can pay out slowly when it turns: check the withdrawal delay before you deposit.',
    },
  ],
  [
    /liquid staking|restak|staking pool/i,
    {
      core: [
        'Stake $${capital} of the chain’s staking asset through {name} on {chain} and keep the receipt token in the same wallet',
        'Stake $${capital} through {name} on {chain} and hold the receipt token it issues in the same wallet',
      ],
      second: [
        'Use the receipt token in one {name}-supported pool on {chain}, then return it to the wallet',
        'Restake the receipt token through {name} a second time if its page offers it',
        'Swap a small part of the {name} receipt token back to the staking asset to test the exit',
      ],
      weekly: ['check the staking rewards the {name} receipt token has earned', 'check the exchange rate of the receipt token {name} issues', 'claim any staking rewards {name} has paid'],
      watch: ['the {name} staking page for the exchange rate of the receipt token', 'the {name} staking page for the receipt token’s exchange rate and any unbonding delay'],
      caution: 'The receipt token’s exchange rate is the position: if it slips against the staking asset, find out why before adding more.',
    },
  ],
  [
    /bridge|canonical bridge|cross chain/i,
    {
      core: [
        'Bridge $${capital} of USDC to {chain} through {name} and use the bridged funds in an app on the destination chain',
        'Send $${capital} of USDC across {name} to {chain} and put the bridged funds to work in an app on that chain',
      ],
      second: [
        'Bridge a smaller amount back through {name} so the wallet shows both directions',
        'Bridge to a second destination chain {name} supports and hold the funds there for a week',
        'Use the bridged funds in a second app on {chain} before bridging any back through {name}',
      ],
      weekly: ['bridge a small amount through {name} to a chain you already use', 'bridge a small amount through {name} and use it the same day', 'check the bridge fee {name} charges this week'],
      watch: ['the {name} bridge page for fees and the time a transfer takes', 'the {name} bridge page for the fee and the transfer time'],
      caution: 'Bridges are the most phished surface in crypto: only use the link {name}’s own site publishes, and never bridge to an address you have not checked twice.',
    },
  ],
  [
    /derivative|perpetual/i,
    {
      core: [
        'Deposit $${capital} of USDC as margin on {name} and open one small hedged position, sized so a sharp move cannot liquidate it',
        'Fund $${capital} of USDC margin on {name} and open one small position you could afford to lose outright',
      ],
      second: [
        'Close the {name} position, then open a second one in the opposite direction with a smaller size',
        'Place one limit order on {name} and let it fill or expire on its own',
        'Set a stop on the {name} position and check that it triggers as expected',
      ],
      weekly: ['open and close one small hedged position on {name}', 'review the funding rate on your {name} position', 'close any {name} position you no longer want to hold'],
      watch: ['your margin, the funding rate and the liquidation price on {name}', 'the liquidation price and the funding rate on {name}'],
      caution: 'Size the position so a sharp move cannot liquidate it: margin that can be wiped out in one candle is not farming.',
    },
  ],
  [
    /^chain$/i,
    {
      core: [
        'Bridge $${capital} of USDC to the {name} chain and use it in one of the chain’s own apps, keeping the funds on the chain',
        'Move $${capital} of USDC onto the {name} chain and put it to work in a native app, keeping the funds on the chain',
      ],
      second: [
        'Swap a small amount on {name}’s main dex and hold the received asset for a week',
        'Try a second native app on {name} with a small amount',
        'Provide a small amount of liquidity on {name}’s main dex',
      ],
      weekly: ['make one transaction in a native app on {name}', 'use one native app on {name} this week', 'check what is new on the {name} chain this week'],
      watch: ['the {name} chain’s own explorer for your transaction history', 'the {name} chain’s explorer for new apps and your transactions'],
      caution: 'A new chain’s apps are the risk: use the chain’s own app list, start small, and never connect the wallet to a lookalike site.',
    },
  ],
  [
    /card issuer/i,
    {
      core: [
        'Top up {name}’s card with $${capital} on {chain} and spend a small amount on something you would buy anyway',
        'Load $${capital} onto the {name} card on {chain} and make one real purchase with it',
      ],
      second: [
        'Receive one cashback or reward payout from {name} into the same wallet',
        'Spend through {name} a second time in a different category',
        'Set up a small recurring top-up for the {name} card',
      ],
      weekly: ['make one real payment through {name}', 'spend a small amount with the {name} card', 'check the rewards {name} paid this week'],
      watch: ['the {name} card page for fees, limits and reward rates', 'the {name} card page for the reward rate and the spending limit'],
      caution: 'A card is spending, not an investment: only load what you plan to spend, and check the fee on every top-up.',
    },
  ],
  [
    /payment/i,
    {
      core: [
        'Pay $${capital} through {name} on {chain} for something you would buy anyway, using its own checkout flow',
        'Send $${capital} through {name} on {chain} to pay for a real purchase, using its own checkout flow',
      ],
      second: [
        'Receive one payment through {name} into the same wallet',
        'Set up a recurring payment through {name} for a small weekly amount',
        'Pay a second, smaller amount through {name} to a different recipient',
      ],
      weekly: ['make one real payment through {name}', 'send one payment through {name} this week', 'check the settlement time on your last {name} payment'],
      watch: ['the {name} payments page for settlement times and fees', 'the {name} payments page for the fee on each payment'],
      caution: 'Payments are final on-chain: check the recipient address twice, and never pay an invoice that arrived by DM.',
    },
  ],
  [
    /insurance/i,
    {
      core: [
        'Buy $${capital} of cover from {name} on {chain} for a position you already hold, and read what the policy excludes',
        'Take $${capital} of cover on {name} on {chain} for a position you hold, after reading the exclusions on its own page',
      ],
      second: [
        'Buy a second, smaller cover for a different risk {name} lists',
        'File a test claim inquiry through {name}’s own page to learn the process, without filing a false claim',
        'Check the premium {name} charges for a longer cover period',
      ],
      weekly: ['check the cover’s expiry and the premium {name} charges', 'check whether the {name} cover you hold still matches the position', 'review the claim conditions on your {name} cover'],
      watch: ['the {name} policy page for expiry dates and claim conditions', 'the {name} policy page for the claim process and the exclusions'],
      caution: 'Cover only pays for what the policy names: read the exclusions before you buy, not after something goes wrong.',
    },
  ],
  [
    /prediction/i,
    {
      core: [
        'Fund $${capital} and place one position on {a} {name} market you have actually read, on {chain}',
        'Put $${capital} into one {name} market on {chain} after reading its resolution rules in full',
      ],
      second: [
        'Take the opposite side of a small market on {name} to show both directions',
        'Provide liquidity to {a} {name} market instead of taking a side',
        'Close the position before resolution and record the result',
      ],
      weekly: ['settle or close one position on {name}', 'check the resolution rules on your open {name} markets', 'close one {name} position this week'],
      watch: ['your open positions on {name} and the market’s resolution rules', 'the {name} market page for resolution dates and rules'],
      caution: 'A prediction market pays on its written resolution rules, not on what happened in the world: read them before you place anything.',
    },
  ],
  [
    /governance/i,
    {
      core: [
        'Deposit $${capital} into {name} on {chain} and delegate or vote with the position on a live proposal',
        'Put $${capital} into {name} on {chain} and vote with it on a live proposal',
      ],
      second: [
        'Vote on a second {name} proposal from the same wallet',
        'Join {a} {name} discussion thread and post one substantive comment',
        'Delegate the position to a delegate {name} lists, then vote yourself on the next proposal',
      ],
      weekly: ['vote on any new {name} proposal that opens', 'check which {name} proposals are open this week', 'read one {name} proposal discussion this week'],
      watch: ['the {name} governance page for new proposals and voting deadlines', 'the {name} governance page for voting deadlines'],
      caution: 'Votes are on-chain and public: read the proposal before you vote, and never delegate to an address you have not checked.',
    },
  ],
  [
    /index/i,
    {
      core: [
        'Buy $${capital} of the {name} index on {chain} and hold the index token in the wallet',
        'Put $${capital} into the {name} index on {chain} and hold the index token',
      ],
      second: [
        'Rebalance the index position once through {name}’s own page',
        'Mint the {name} index with its underlying assets instead of buying it outright',
        'Redeem a small part of the {name} index to test the exit',
      ],
      weekly: ['check the index composition {name} publishes', 'check the {name} index price against its underlying assets', 'review the rebalances {name} made this week'],
      watch: ['the {name} index page for rebalances and fees', 'the {name} index page for the fee and the next rebalance'],
      caution: 'An index is only as good as its composition: check what it holds and when it rebalances before you buy.',
    },
  ],
  [
    /launchpad/i,
    {
      core: [
        'Stake $${capital} through {name} on {chain} to qualify for its launches and join one sale with a small allocation',
        'Put $${capital} to work through {name} on {chain} to qualify for a launch, and take a small allocation in one sale',
      ],
      second: [
        'Claim the allocation from the {name} sale and hold it for a week',
        'Join a second {name} launch with a smaller allocation',
        'Check the vesting terms on the allocation {name} gave you',
      ],
      weekly: ['check which launches {name} has open', 'check the sale calendar {name} publishes', 'review your allocations on {name}'],
      watch: ['the {name} launchpad page for sale dates and allocation rules', 'the {name} launchpad page for the next sale date'],
      caution: 'Launch allocations can vest for months: read the vesting schedule before you join, and never buy an allocation from a third party.',
    },
  ],
  [
    /option/i,
    {
      core: [
        'Deposit $${capital} as collateral on {name} and buy one small option on {chain}, sized so the most you can lose is the premium',
        'Post $${capital} as collateral on {name} and buy one small option on {chain}, risking only the premium',
      ],
      second: [
        'Sell one covered option on {name} against an asset you hold',
        'Close the {name} option before expiry and record the result',
        'Buy a second option on {name} with a different expiry',
      ],
      weekly: ['review open option positions on {name}', 'check the expiry dates on your {name} options', 'close any {name} option near expiry'],
      watch: ['expiry dates and implied volatility on {name}', 'the {name} option page for expiry dates and volatility'],
      caution: 'An option you buy can only lose its premium, but an option you sell can lose far more: never sell uncovered.',
    },
  ],
  [
    /cedefi/i,
    {
      core: [
        'Deposit $${capital} into {name}’s managed vault on {chain} and read who holds custody and how withdrawals work before you deposit',
        'Put $${capital} into {a} {name} vault on {chain} once you have read the custodian, the strategy and the withdrawal terms',
      ],
      second: [
        'Withdraw a small test amount from {name} to confirm the custodian’s exit path works',
        'Move a small amount to a second {name} vault with a different strategy',
        'Check the audit or proof of reserves {name} publishes for the vault',
      ],
      weekly: ['check the vault return {name} reports', 'check the custodian report {name} publishes', 'review the withdrawal queue on {name}'],
      watch: ['the {name} vault page for the custodian, the strategy and withdrawal terms', 'the {name} vault page for withdrawal delays'],
      caution: 'CeDeFi means a custodian holds the funds: read who it is and how withdrawals work before you deposit anything.',
    },
  ],
  [
    /farm/i,
    {
      core: [
        'Deposit $${capital} into {name}’s farm on {chain} and stake the position to earn its rewards',
        'Put $${capital} into {a} {name} farm on {chain} and keep the staked position open',
      ],
      second: [
        'Harvest the farm rewards once and restake them into the same {name} farm',
        'Open a second, smaller {name} farm position in a different pool',
        'Claim the rewards {name} paid and record the amount',
      ],
      weekly: ['harvest and restake a small amount of farm rewards on {name}', 'check the farm reward rate {name} pays', 'compound the rewards {name} paid this week'],
      watch: ['the {name} farm page for the reward rate and any lock-up', 'the {name} farm page for the reward token and its lock-up'],
      caution: 'Farm rewards are often paid in a token that falls as fast as it is farmed: check what the reward is worth before restaking it.',
    },
  ],
  [
    /anchor btc|decentralized btc|bitcoin/i,
    {
      core: [
        'Deposit $${capital} of BTC into {name} on {chain} to earn yield on it, after reading how the yield is generated on its own page',
        'Put $${capital} of BTC to work through {name} on {chain} once you have read where its yield comes from',
      ],
      second: [
        'Withdraw a small test amount of BTC from {name} to confirm the exit works',
        'Move a small amount of the yield into a second {name} position',
        'Check the BTC yield {name} paid this week and record it',
      ],
      weekly: ['check the BTC yield {name} is paying', 'check the yield {name} paid on your BTC', 'review the yield source {name} reports'],
      watch: ['the {name} position page for the BTC yield and any lock-up', 'the {name} position page for the yield source and withdrawal terms'],
      caution: 'BTC yield always has a source — lending, staking or basis: read what it is before you deposit, and never assume BTC yield is risk-free.',
    },
  ],
];

const DEFAULT_PROFILE: FarmProfile = {
  core: [
    'Deposit $${capital} of USDC into {name} on {chain} and keep the position open',
    'Put $${capital} of USDC to work in {name}’s main product on {chain} and leave the position open',
  ],
  second: [
    'Make a second, smaller deposit into a different {name} product on {chain}',
    'Use one more feature of {name} on {chain}, such as a swap or a vote, from the same wallet',
    'Try a second {name} product on {chain} with a small amount',
  ],
  weekly: ['repeat one qualifying action on {name}', 'make one transaction on {name} this week', 'check what is new on {name} this week'],
  watch: ['the {name} protocol page for points, rewards or changes to its terms', 'the {name} protocol page for new features and reward terms'],
  caution: 'Read the protocol’s own page before every new action: a product you have not read is a risk you have not priced.',
};

function profileFor(p: SnapshotProtocol): FarmProfile {
  const c = p.category ?? '';
  for (const [re, profile] of PROFILES) {
    if (re.test(c)) return profile;
  }
  return DEFAULT_PROFILE;
}

/** "a" or "an" before a protocol's name: vowel-initial names take "an" (USDD is pronounced "yoo", so it takes "a"). */
function articleFor(name: string): string {
  return /^[aeiou]/i.test(name) && !/^usdd/i.test(name) ? 'an' : 'a';
}

function fill(template: string, p: SnapshotProtocol, capital: number, chain: string): string {
  return template
    .replaceAll('${capital}', String(capital))
    .replaceAll('{name}', p.name)
    .replaceAll('{chain}', chain)
    .replaceAll('{slug}', p.slug)
    .replaceAll('{gas}', gasToken(chain))
    .replaceAll('{a}', articleFor(p.name));
}

/** The first step's three wordings: entry through the protocol's DefiLlama page, fresh wallet, test deposit. */
const ENTRY_STEPS = [
  'Open {name}’s official app — find its link on its DefiLlama page, defillama.com/protocol/{slug} — from a fresh wallet that holds only your farming funds, and keep that wallet’s seed phrase offline. Send a $10 test deposit first and confirm it lands before the full amount.',
  'Set up a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline. Find {name}’s official app through its DefiLlama page, defillama.com/protocol/{slug}, and send a $10 test deposit on {chain} first — keep {gas} in the wallet for fees, and confirm the test lands before the full amount.',
  'Use a fresh wallet for {name} only, with its seed phrase kept offline. Open the protocol’s app from its DefiLlama page, defillama.com/protocol/{slug}, and make a $10 test deposit on {chain} first to confirm the path works — keep {gas} aside for fees — before the full amount.',
];

/** The last step's four wordings: claim safety, each ending on the no-promise sentence. */
const SAFETY_STEPS = [
  'If {name} ever opens a claim, use only the link its own site or official account publishes, never pay to claim, and never sign an approval you have not read. DefiLlama’s record lists no token for {name}, so nothing here promises an airdrop or any return.',
  'Never pay to claim anything from {name}, and only trust a claim link its own site or official account publishes. Read every approval before you sign it. DefiLlama’s record lists no token for {name}, so nothing here promises an airdrop or any return.',
  'Treat any claim link for {name} that arrives by DM or search ad as a scam: the only trustworthy link is one its own site or official account publishes, and claiming is never paid. DefiLlama’s record lists no token for {name}, so nothing here promises an airdrop or any return.',
  'Before you sign anything for {name}, read the approval and check what it can move — a farming position never needs an unlimited approval. DefiLlama’s record lists no token for {name}, so nothing here promises an airdrop or any return.',
];

/** The hold step's two wordings. */
const HOLD_STEPS = [
  'Hold the position for at least {hold} days so the activity is counted in more than one snapshot, and check {watch} once a week.',
  'Keep the position open for at least {hold} days — activity across several snapshots counts more than a single deposit — and each week check {watch}.',
];

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Step 1 names the entry (the protocol's DefiLlama page), step 2 the core action with its
 * caution, steps 3-5 the second action, the weekly action and the hold, and step 6 the claim
 * safety note. Every step says what to do, what it costs and how long it takes, and the last step
 * says plainly that DefiLlama's record lists no token for this protocol, so nothing here promises
 * an airdrop or any return.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const profile = profileFor(p);
  const core = profile.core[pick(`${p.slug}:core`, profile.core.length)]!;
  const second = profile.second[pick(`${p.slug}:second`, profile.second.length)]!;
  const weekly = profile.weekly[pick(`${p.slug}:weekly`, profile.weekly.length)]!;
  const watch = profile.watch[pick(`${p.slug}:watch`, profile.watch.length)]!;
  const entry = ENTRY_STEPS[pick(`${p.slug}:entry`, ENTRY_STEPS.length)]!;
  const safety = SAFETY_STEPS[pick(`${p.slug}:safety`, SAFETY_STEPS.length)]!;
  const holdStep = HOLD_STEPS[pick(`${p.slug}:hold`, HOLD_STEPS.length)]!;
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: fill(entry, p, capital, chain),
      cost: 'a few dollars of network fees for the first transaction',
      time: '15 minutes',
    },
    {
      text: `${fill(core, p, capital, chain)}. ${fill(profile.caution, p, capital, chain)}`,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${fill(second, p, capital, chain)}.`,
      cost: `about $${Math.max(2, Math.round(capital / 25))} of gas`,
      time: '15 minutes',
    },
    {
      text: `Once a week, ${fill(weekly, p, capital, chain)}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: fill(holdStep, p, capital, chain).replaceAll('{hold}', String(hold)).replaceAll('{watch}', fill(watch, p, capital, chain)),
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: fill(safety, p, capital, chain),
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
    global_multiple: row.model.global_multiple,
    category_multiple: row.model.category_multiple,
    category_factor: row.model.category_factor,
    category_weight: row.model.category_weight,
    category_peers: row.model.category_peers,
    category_median_multiple: row.model.category_median_multiple,
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
    category_multiples: model.category_multiples,
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
