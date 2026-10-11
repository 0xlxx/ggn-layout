export const ROOT: string
export const DIRS: string[]
export const EPS: number
export function oraclePath(): string
export function registryPath(): string
export function loadOracle(): Record<string, unknown>
export interface RegistryCase {
  cat?: string
  ok?: boolean
  nodesOk?: boolean
  nEdges?: number
  matched?: number
  fails?: unknown[]
  reason?: string
}
export interface Registry {
  version?: number
  eps?: number
  oracleHash?: string
  cases: Record<string, RegistryCase>
}
export interface CompareResult {
  nEdges: number
  matched: number
  fails: Array<{ edge?: string; ggn?: unknown; jar?: unknown }>
  crashed?: string
}
export function loadRegistry(): Registry
export function oracleHash(): string
export function classify(rel: string, parsed: unknown): string | null
export function layoutAndExtract(rel: string, dir: string): unknown
export function compare(rel: string, dir: string, oracle?: unknown): CompareResult
export function checkNodePositions(rel: string, dir: string, oracle?: unknown): CompareResult
export function compareSafe(rel: string, dir: string, oracle?: unknown): CompareResult
export function collectCases(oracle?: Record<string, unknown>): Array<{ rel: string; dir: string; cat: string; key: string }>
export function summarize(r: Record<string, unknown>): string
