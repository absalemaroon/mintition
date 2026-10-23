/**
 * Chain registry (presentation + routing metadata).
 *
 * A chain is "live" when it has an RPC endpoint (see PUBLIC_RPC below): you can select it and use it for
 * minting, trading and transfers. Chains with no RPC yet are "soon": listed, but disabled. Before enabling one, verify its chainId, native symbol and explorer on
 * https://chainlist.org (entries with an empty explorerUrl have not been checked),
 * then add an RPC URL to PUBLIC_RPC. See MULTICHAIN.md.
 */
import logos from "@/lib/chain-logos.json"

export type ChainStatus = "live" | "soon"
export type ChainFamily = "evm" | "solana"

export interface ChainConfig {
  /** Decimal chain id as a string. Matches the `networkId` state in the dashboard. */
  id: string
  chainId: number
  name: string
  nativeSymbol: string
  /** Base URL of the block explorer, no trailing slash. Empty means "not verified yet". */
  explorerUrl: string
  status: ChainStatus
  /** Brand colour, used for the monogram fallback when no logo file exists. */
  color: string
  /** Default public RPC for live chains. Override with the RPC_URL_<chainId> env var. */
  rpcUrl?: string
  /** Path under /public, filled in by scripts/fetch-chain-logos.mjs. */
  logo?: string
  /** DexScreener chain slug, for token market data. Missing = data is shown from any chain. */
  dexscreener?: string
  /** CoinGecko id of the native coin, for USD prices. */
  coingecko?: string
  family: ChainFamily
  /** Decimals of the native coin (18 on EVM chains, 9 for SOL). */
  nativeDecimals: number
}

/** Stable colour from the chain name, for entries without a brand colour. */
function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 55% 45%)`
}

const logoMap = logos as Record<string, string>

/**
 * Public RPC endpoints from each network's own docs. They are checked on every use: the worker asks the node
 * for its chain id and refuses to continue if it does not match. Use Settings > Network check to test them all.
 * Override any of them with the RPC_URL_<chainId> environment variable (for example a private Alchemy URL).
 * Chains without an entry here stay "soon" until one is added.
 */
const PUBLIC_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  10: "https://mainnet.optimism.io",
  14: "https://flare-api.flare.network/ext/C/rpc",
  19: "https://songbird-api.flare.network/ext/C/rpc",
  25: "https://evm.cronos.org",
  30: "https://public-node.rsk.co",
  40: "https://mainnet.telos.net/evm",
  50: "https://rpc.xdcrpc.com",
  56: "https://bsc-dataseed.binance.org",
  57: "https://rpc.syscoin.org",
  61: "https://etc.rivet.link",
  82: "https://rpc.meter.io",
  88: "https://rpc.viction.xyz",
  96: "https://rpc.bitkubchain.io",
  100: "https://rpc.gnosischain.com",
  122: "https://rpc.fuse.io",
  130: "https://mainnet.unichain.org",
  137: "https://polygon-rpc.com",
  146: "https://rpc.soniclabs.com",
  169: "https://pacific-rpc.manta.network/http",
  177: "https://mainnet.hsk.xyz",
  185: "https://rpc.mintchain.io",
  196: "https://rpc.xlayer.tech",
  204: "https://opbnb-mainnet-rpc.bnbchain.org",
  223: "https://rpc.bsquared.network",
  232: "https://rpc.lens.xyz",
  250: "https://rpcapi.fantom.network",
  252: "https://rpc.frax.com",
  255: "https://api.kroma.network",
  288: "https://mainnet.boba.network",
  314: "https://api.node.glif.io/rpc/v1",
  324: "https://mainnet.era.zksync.io",
  360: "https://mainnet.shape.network",
  361: "https://eth-rpc-api.thetatoken.org/rpc",
  369: "https://rpc.pulsechain.com",
  388: "https://mainnet.zkevm.cronos.org",
  480: "https://worldchain-mainnet.g.alchemy.com/public",
  570: "https://rpc.rollux.com",
  592: "https://evm.astar.network",
  690: "https://rpc.redstonechain.com",
  698: "https://rpc.matchain.io",
  747: "https://mainnet.evm.nodes.onflow.org",
  841: "https://rpc.mainnet.taraxa.io",
  999: "https://rpc.hyperliquid.xyz/evm",
  1030: "https://evm.confluxrpc.com",
  1088: "https://andromeda.metis.io/?owner=1088",
  1101: "https://zkevm-rpc.com",
  1111: "https://api.wemix.com",
  1116: "https://rpc.coredao.org",
  1135: "https://rpc.api.lisk.com",
  1284: "https://rpc.api.moonbeam.network",
  1285: "https://rpc.api.moonriver.moonbeam.network",
  1329: "https://evm-rpc.sei-apis.com",
  1514: "https://mainnet.storyrpc.io",
  1625: "https://rpc.gravity.xyz",
  1750: "https://rpc.metall2.com",
  1868: "https://rpc.soneium.org",
  1890: "https://replicator.phoenix.lightlink.io/rpc/v1",
  1923: "https://swell-mainnet.alt.technology",
  1996: "https://mainnet.sanko.xyz",
  2000: "https://rpc.dogechain.dog",
  2020: "https://api.roninchain.com/rpc",
  2222: "https://evm.kava.io",
  2345: "https://rpc.goat.network",
  2741: "https://api.mainnet.abs.xyz",
  2818: "https://rpc-quicknode.morphl2.io",
  3338: "https://peaq.api.onfinality.io/public",
  4200: "https://rpc.merlinchain.io",
  4689: "https://babel-api.mainnet.iotex.io",
  5000: "https://rpc.mantle.xyz",
  7000: "https://zetachain-evm.blockpi.network/v1/rpc/public",
  7560: "https://cyber.alt.technology",
  7897: "https://rpc.arena-z.gg",
  8217: "https://public-en.node.kaia.io",
  8453: "https://mainnet.base.org",
  11235: "https://rpc.eth.haqq.network",
  13371: "https://rpc.immutable.com",
  23294: "https://sapphire.oasis.io",
  32769: "https://api.zilliqa.com",
  33139: "https://apechain.calderachain.xyz/http",
  34443: "https://mainnet.mode.network",
  42161: "https://arb1.arbitrum.io/rpc",
  42170: "https://nova.arbitrum.io/rpc",
  42262: "https://emerald.oasis.io",
  42766: "https://rpc.zkfair.io",
  42793: "https://node.mainnet.etherlink.com",
  43111: "https://rpc.hemi.network/rpc",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  50104: "https://rpc.sophon.xyz",
  55244: "https://rpc.superposition.so",
  57073: "https://rpc-gel.inkonchain.com",
  59144: "https://rpc.linea.build",
  60808: "https://rpc.gobob.xyz",
  70700: "https://rpc.apex.proofofplay.com",
  80094: "https://rpc.berachain.com",
  81457: "https://rpc.blast.io",
  98866: "https://rpc.plume.org",
  111188: "https://real.drpc.org",
  167000: "https://rpc.mainnet.taiko.xyz",
  200901: "https://rpc.bitlayer.org",
  534352: "https://rpc.scroll.io",
  660279: "https://xai-chain.net/rpc",
  7777777: "https://rpc.zora.energy",
  21000000: "https://maizenet-rpc.usecorn.com",
  666666666: "https://rpc.degen.tips",
  888888888: "https://rpc.ancient8.gg",
  1313161554: "https://mainnet.aurora.dev",
  1666600000: "https://api.harmony.one",
}

/** DexScreener chain slugs (token price, volume, market cap). Wrong or missing is harmless: see dexscreener above. */
const DEXSCREENER: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  14: "flare",
  25: "cronos",
  30: "rootstock",
  40: "telos",
  56: "bsc",
  88: "viction",
  100: "gnosischain",
  122: "fuse",
  130: "unichain",
  137: "polygon",
  146: "sonic",
  169: "manta",
  196: "xlayer",
  204: "opbnb",
  232: "lens",
  250: "fantom",
  252: "fraxtal",
  288: "boba",
  314: "filecoin",
  324: "zksync",
  360: "shape",
  369: "pulsechain",
  480: "worldchain",
  592: "astar",
  747: "flowevm",
  999: "hyperevm",
  1030: "conflux",
  1088: "metis",
  1101: "polygonzkevm",
  1111: "wemix",
  1116: "core",
  1135: "lisk",
  1284: "moonbeam",
  1285: "moonriver",
  1329: "sei",
  1514: "story",
  1868: "soneium",
  1923: "swellchain",
  2020: "ronin",
  2222: "kava",
  2741: "abstract",
  4200: "merlin",
  4689: "iotex",
  5000: "mantle",
  7000: "zetachain",
  7560: "cyber",
  8453: "base",
  13371: "immutablezkevm",
  33139: "apechain",
  34443: "mode",
  42161: "arbitrum",
  42170: "arbitrumnova",
  42220: "celo",
  42793: "etherlink",
  43111: "hemi",
  43114: "avalanche",
  57073: "ink",
  59144: "linea",
  60808: "bob",
  80094: "berachain",
  81457: "blast",
  98866: "plume",
  167000: "taiko",
  200901: "bitlayer",
  534352: "scroll",
  7777777: "zora",
  666666666: "degen",
  1313161554: "aurora",
  1666600000: "harmony",
}

/** CoinGecko ids of the native coins (USD prices). A missing or wrong id only means no price is shown. */
const COINGECKO: Record<number, string> = {
  1: "ethereum",
  10: "ethereum",
  14: "flare-networks",
  25: "crypto-com-chain",
  40: "telos",
  50: "xdce-crowd-sale",
  56: "binancecoin",
  61: "ethereum-classic",
  88: "tomochain",
  100: "xdai",
  122: "fuse-network-token",
  130: "ethereum",
  137: "polygon-ecosystem-token",
  146: "sonic-3",
  169: "ethereum",
  204: "binancecoin",
  250: "fantom",
  255: "ethereum",
  288: "ethereum",
  314: "filecoin",
  324: "ethereum",
  360: "ethereum",
  361: "theta-fuel",
  369: "pulsechain",
  480: "ethereum",
  592: "astar",
  690: "ethereum",
  999: "hyperliquid",
  1030: "conflux-token",
  1088: "metis-token",
  1101: "ethereum",
  1111: "wemix-token",
  1116: "coredaoorg",
  1135: "ethereum",
  1284: "moonbeam",
  1285: "moonriver",
  1329: "sei-network",
  1514: "story-2",
  1868: "ethereum",
  2222: "kava",
  2741: "ethereum",
  4689: "iotex",
  5000: "mantle",
  7000: "zetachain",
  7560: "ethereum",
  8217: "kaia",
  8453: "ethereum",
  33139: "apecoin",
  34443: "ethereum",
  42161: "ethereum",
  42170: "ethereum",
  43114: "avalanche-2",
  57073: "ethereum",
  59144: "ethereum",
  60808: "ethereum",
  80094: "berachain-bera",
  81457: "ethereum",
  167000: "ethereum",
  534352: "ethereum",
  7777777: "ethereum",
  21000000: "ethereum",
  1313161554: "ethereum",
  1666600000: "harmony",
}

function soon(chainId: number, name: string, nativeSymbol: string, explorerUrl: string, extra: { color?: string } = {}): ChainConfig {
  const rpcUrl = PUBLIC_RPC[chainId]
  return {
    id: String(chainId),
    chainId,
    name,
    nativeSymbol,
    explorerUrl,
    status: rpcUrl ? "live" : "soon",
    color: extra.color ?? colorFromName(name),
    rpcUrl,
    logo: logoMap[String(chainId)] ?? `/api/logo/chain/${chainId}`,
    dexscreener: DEXSCREENER[chainId],
    coingecko: COINGECKO[chainId],
    family: "evm",
    nativeDecimals: 18,
  }
}

export const CHAINS: ChainConfig[] = [
  {
    id: "42220",
    chainId: 42220,
    name: "Celo",
    nativeSymbol: "CELO",
    explorerUrl: "https://celoscan.io",
    status: "live",
    color: "#FCFF52",
    rpcUrl: "https://forno.celo.org",
    logo: logoMap["42220"] ?? "/api/logo/chain/42220",
    dexscreener: "celo",
    coingecko: "celo",
    family: "evm",
    nativeDecimals: 18,
  },
  {
    id: "101",
    chainId: 101, // internal id for Solana mainnet (Solana has no EVM chain id)
    name: "Solana",
    nativeSymbol: "SOL",
    explorerUrl: "https://solscan.io",
    status: "live",
    color: "#9945FF",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    logo: logoMap["101"] ?? "/api/logo/chain/101",
    dexscreener: "solana",
    coingecko: "solana",
    family: "solana",
    nativeDecimals: 9,
  },
  soon(1, "Ethereum", "ETH", "https://etherscan.io", { color: "#627EEA" }),
  soon(56, "BNB Smart Chain", "BNB", "https://bscscan.com", { color: "#F0B90B" }),
  soon(100, "Gnosis", "xDAI", "https://gnosisscan.io", { color: "#04795B" }),
  soon(250, "Fantom Opera", "FTM", "https://ftmscan.com", { color: "#1969FF" }),
  soon(146, "Sonic", "S", "https://sonicscan.org"),
  soon(43114, "Avalanche C-Chain", "AVAX", "https://snowtrace.io", { color: "#E84142" }),
  soon(324, "zkSync Era", "ETH", "https://explorer.zksync.io", { color: "#4E529A" }),
  soon(1101, "Polygon zkEVM", "ETH", "https://zkevm.polygonscan.com", { color: "#8247E5" }),
  soon(59144, "Linea", "ETH", "https://lineascan.build", { color: "#61DFFF" }),
  soon(534352, "Scroll", "ETH", "https://scrollscan.com", { color: "#FFEEDA" }),
  soon(81457, "Blast", "ETH", "https://blastscan.io", { color: "#FCFC03" }),
  soon(5000, "Mantle", "MNT", "https://mantlescan.xyz", { color: "#65B3AE" }),
  soon(34443, "Mode", "ETH", ""),
  soon(7777777, "Zora", "ETH", "https://explorer.zora.energy"),
  soon(1088, "Metis", "METIS", "https://explorer.metis.io", { color: "#00DACC" }),
  soon(25, "Cronos", "CRO", "https://cronoscan.com", { color: "#002D74" }),
  soon(1284, "Moonbeam", "GLMR", "https://moonscan.io", { color: "#53CBC9" }),
  soon(1285, "Moonriver", "MOVR", "https://moonriver.moonscan.io", { color: "#F2B705" }),
  soon(1313161554, "Aurora", "ETH", "https://aurorascan.dev", { color: "#70D44B" }),
  soon(1666600000, "Harmony", "ONE", "https://explorer.harmony.one", { color: "#00AEE9" }),
  soon(2222, "Kava EVM", "KAVA", "https://kavascan.com", { color: "#FF564F" }),
  soon(122, "Fuse", "FUSE", "https://explorer.fuse.io", { color: "#B4F9BA" }),
  soon(288, "Boba Network", "ETH", "https://bobascan.com", { color: "#CCFF00" }),
  soon(8217, "Kaia", "KAIA", "https://kaiascan.io"),
  soon(204, "opBNB", "BNB", "https://opbnb.bscscan.com", { color: "#F0B90B" }),
  soon(169, "Manta Pacific", "ETH", "https://pacific-explorer.manta.network"),
  soon(167000, "Taiko Alethia", "ETH", "https://taikoscan.io", { color: "#E81899" }),
  soon(1329, "Sei", "SEI", "https://seitrace.com"),
  soon(592, "Astar", "ASTR", "https://astar.blockscout.com", { color: "#0070EB" }),
  soon(9001, "Evmos", "EVMOS", ""),
  soon(1116, "Core", "CORE", "https://scan.coredao.org", { color: "#FF9211" }),
  soon(30, "Rootstock", "RBTC", "https://rootstock.blockscout.com", { color: "#FF9100" }),
  soon(14, "Flare", "FLR", "https://flarescan.com", { color: "#E62058" }),
  soon(19, "Songbird", "SGB", ""),
  soon(40, "Telos EVM", "TLOS", "https://teloscan.io"),
  soon(1135, "Lisk", "ETH", "https://blockscout.lisk.com"),
  soon(57073, "Ink", "ETH", "https://explorer.inkonchain.com"),
  soon(130, "Unichain", "ETH", "https://uniscan.xyz", { color: "#FC0A54" }),
  soon(1868, "Soneium", "ETH", "https://soneium.blockscout.com"),
  soon(480, "World Chain", "ETH", "https://worldscan.org"),
  soon(80094, "Berachain", "BERA", "https://berascan.com"),
  soon(2741, "Abstract", "ETH", "https://abscan.org"),
  soon(2020, "Ronin", "RON", ""),
  soon(185, "Mint", "ETH", "https://explorer.mintchain.io"),
  soon(60808, "BOB", "ETH", "https://explorer.gobob.xyz"),
  soon(252, "Fraxtal", "frxETH", "https://fraxscan.com"),
  soon(7560, "Cyber", "ETH", "https://cyberscan.co"),
  soon(690, "Redstone", "ETH", "https://explorer.redstone.xyz", { color: "#EF4444" }),
  soon(360, "Shape", "ETH", "https://shapescan.xyz"),
  soon(48900, "Zircuit", "ETH", "https://explorer.zircuit.com"),
  soon(2818, "Morph", "ETH", "https://explorer.morphl2.io"),
  soon(43111, "Hemi", "ETH", "https://explorer.hemi.xyz"),
  soon(1514, "Story", "IP", "https://storyscan.io"),
  soon(98866, "Plume", "PLUME", "https://explorer.plume.org"),
  soon(33139, "ApeChain", "APE", "https://apescan.io", { color: "#0054FA" }),
  soon(1625, "Gravity Alpha", "G", "https://explorer.gravity.xyz"),
  soon(50, "XDC Network", "XDC", "https://xdcscan.com"),
  soon(88, "Viction", "VIC", "https://vicscan.xyz"),
  soon(4689, "IoTeX", "IOTX", "https://iotexscan.io", { color: "#00D4D5" }),
  soon(314, "Filecoin", "FIL", ""),
  soon(7000, "ZetaChain", "ZETA", "https://zetascan.com", { color: "#008462" }),
  soon(666666666, "Degen", "DEGEN", "https://explorer.degen.tips", { color: "#A36EFD" }),
  soon(55244, "Superposition", "ETH", "https://explorer.superposition.so"),
  soon(255, "Kroma", "ETH", "https://kromascan.com"),
  soon(232, "Lens", "GHO", "https://explorer.lens.xyz"),
  soon(21000000, "Corn", "BTCN", "https://cornscan.io"),
  soon(747, "Flow EVM", "FLOW", "https://evm.flowscan.io", { color: "#00EF8B" }),
  soon(999, "HyperEVM", "HYPE", "https://hyperevmscan.io"),
  soon(747474, "Katana", "ETH", ""),
  soon(1923, "Swellchain", "ETH", "https://explorer.swellnetwork.io"),
  soon(200901, "Bitlayer", "BTC", "https://www.btrscan.com"),
  soon(4200, "Merlin", "BTC", "https://scan.merlinchain.io"),
  soon(223, "B2 Network", "BTC", "https://explorer.bsquared.network"),
  soon(42766, "ZKFair", "USDC", "https://scan.zkfair.io"),
  soon(196, "X Layer", "OKB", ""),
  soon(61, "Ethereum Classic", "ETC", "https://etc.blockscout.com", { color: "#3AB83A" }),
  soon(369, "PulseChain", "PLS", "https://scan.pulsechain.com"),
  soon(1111, "WEMIX", "WEMIX", "https://wemixscan.com"),
  soon(42262, "Oasis Emerald", "ROSE", "https://explorer.emerald.oasis.io"),
  soon(23294, "Oasis Sapphire", "ROSE", "https://explorer.oasis.io/mainnet/sapphire"),
  soon(57, "Syscoin", "SYS", "https://explorer.syscoin.org", { color: "#0082C6" }),
  soon(106, "Velas", "VLX", "https://evmexplorer.velas.com"),
  soon(2000, "Dogechain", "DOGE", "https://explorer.dogechain.dog"),
  soon(1030, "Conflux eSpace", "CFX", "https://evm.confluxscan.io"),
  soon(82, "Meter", "MTR", "https://scan.meter.io"),
  soon(361, "Theta", "TFUEL", "https://explorer.thetatoken.org"),
  soon(32769, "Zilliqa EVM", "ZIL", ""),
  soon(336, "Shiden", "SDN", ""),
  soon(42793, "Etherlink", "XTZ", "https://explorer.etherlink.com"),
  soon(841, "Taraxa", "TARA", "https://mainnet.explorer.taraxa.io"),
  soon(888888888, "Ancient8", "ETH", "https://scan.ancient8.gg"),
  soon(660279, "Xai", "XAI", "https://explorer.xai-chain.net"),
  soon(70700, "Proof of Play Apex", "ETH", "https://explorer.apex.proofofplay.com"),
  soon(1996, "Sanko", "DMT", "https://explorer.sanko.xyz"),
  soon(111188, "re.al", "ETH", "https://explorer.re.al"),
  soon(3338, "peaq", "PEAQ", ""),
  soon(177, "HashKey Chain", "HSK", "https://hashkey.blockscout.com"),
  soon(698, "Matchain", "BNB", "https://matchscan.io"),
  soon(2345, "GOAT Network", "BTC", "https://explorer.goat.network"),
  soon(96, "Bitkub Chain", "KUB", "https://www.bkcscan.com"),
  soon(11235, "HAQQ", "ISLM", "https://explorer.haqq.network"),
  soon(570, "Rollux", "SYS", "https://explorer.rollux.com"),
  soon(1890, "LightLink", "ETH", "https://phoenix.lightlink.io"),
  soon(388, "Cronos zkEVM", "zkCRO", "https://explorer.zkevm.cronos.org"),
  soon(13371, "Immutable zkEVM", "IMX", "https://explorer.immutable.com"),
  soon(7897, "Arena-Z", "ETH", "https://explorer.arena-z.gg"),
  soon(1750, "Metal L2", "ETH", "https://explorer.metall2.com"),
  soon(50104, "Sophon", "SOPH", "https://explorer.sophon.xyz"),
  soon(24, "KardiaChain", "KAI", "https://explorer.kardiachain.io"),
  soon(8453, "Base", "ETH", "https://basescan.org", { color: "#0052FF" }),
  soon(137, "Polygon", "POL", "https://polygonscan.com", { color: "#8247E5" }),
  soon(42161, "Arbitrum One", "ETH", "https://arbiscan.io", { color: "#28A0F0" }),
  soon(10, "OP Mainnet", "ETH", "https://optimistic.etherscan.io", { color: "#FF0420" }),
  soon(42170, "Arbitrum Nova", "ETH", "https://nova.arbiscan.io", { color: "#E57310" }),
]

export const DEFAULT_CHAIN_ID = "42220"

export function getChain(id: string): ChainConfig {
  return CHAINS.find((chain) => chain.id === id) ?? CHAINS[0]
}

export function isLiveChain(chainId: number | string): boolean {
  return CHAINS.some((chain) => chain.id === String(chainId) && chain.status === "live")
}

export function explorerTxUrl(chain: ChainConfig, hash: string): string | null {
  if (!chain.explorerUrl) return null
  const ok = chain.family === "solana" ? /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(hash) : /^0x[0-9a-fA-F]{64}$/.test(hash)
  return ok ? `${chain.explorerUrl}/tx/${hash}` : null
}

export function explorerAddressUrl(chain: ChainConfig, address: string): string | null {
  if (!chain.explorerUrl) return null
  return chain.family === "solana" ? `${chain.explorerUrl}/account/${address}` : `${chain.explorerUrl}/address/${address}`
}

/** Address check for the chain's family (format only, no network call). */
export function isValidAddress(chain: ChainConfig, value: string): boolean {
  return chain.family === "solana" ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) : /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function shortAddress(value: string, head = 6, tail = 4): string {
  if (!value) return ""
  return value.length <= head + tail + 3 ? value : `${value.slice(0, head)}...${value.slice(-tail)}`
}
