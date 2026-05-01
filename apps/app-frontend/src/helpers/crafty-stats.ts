/** Shared Crafty `/stats` parsing for list rows and overview. */

export type CraftyStats = Record<string, unknown>

export function craftyTruthy(v: unknown): boolean {
	if (v === true || v === 1) return true
	const s = String(v).toLowerCase()
	return s === 'true' || s === '1' || s === 'yes'
}

export function statStr(stats: CraftyStats | undefined, key: string): string | undefined {
	const v = stats?.[key]
	if (v === undefined || v === null) return undefined
	if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
	return undefined
}

export type CraftyLifecycle = 'online' | 'offline' | 'crashed' | 'unknown'

export function craftyLifecycle(stats: CraftyStats | undefined): CraftyLifecycle {
	if (!stats) return 'unknown'
	if (craftyTruthy(stats.crashed)) return 'crashed'
	const running = craftyTruthy(stats.running)
	if (running) return 'online'
	return 'offline'
}

/** 0–100 if parseable */
export function craftyCpuPercent(stats: CraftyStats | undefined): number | undefined {
	const n = stats?.cpu ?? stats?.cpu_percent
	if (typeof n === 'number' && !Number.isNaN(n)) return Math.min(100, Math.max(0, n))
	const p = typeof n === 'string' ? parseFloat(n.replace(/%/g, '')) : Number.NaN
	if (!Number.isNaN(p)) return Math.min(100, Math.max(0, p))
	return undefined
}

export function craftyMemPercent(stats: CraftyStats | undefined): number | undefined {
	const n = stats?.mem_percent ?? stats.mem_usage_percent
	if (typeof n === 'number' && !Number.isNaN(n)) return Math.min(100, Math.max(0, n))
	const p = typeof n === 'string' ? parseFloat(String(n).replace(/%/g, '')) : Number.NaN
	if (!Number.isNaN(p)) return Math.min(100, Math.max(0, p))
	return undefined
}

export function craftyIconDataUrl(icon: unknown): string | null {
	if (typeof icon !== 'string' || !icon || icon === 'False' || icon === 'None') return null
	if (icon.startsWith('data:')) return icon
	return `data:image/png;base64,${icon}`
}

export function craftyPlayersSnippet(stats: CraftyStats | undefined): string | undefined {
	const o = statStr(stats, 'online')
	const m = statStr(stats, 'max')
	if (o != null || m != null) return `${o ?? '?'} / ${m ?? '?'}`
	return undefined
}

/** Normalize Crafty `/stats` `players` field into display names (array, JSON string, or `{ name }` objects). */
export function craftyParsePlayerLines(raw: unknown): string[] {
	const line = (x: unknown): string => {
		if (typeof x === 'string') return x
		if (x && typeof x === 'object' && 'name' in x) {
			return String((x as { name: unknown }).name)
		}
		return String(x)
	}

	if (Array.isArray(raw)) {
		return raw.map(line).filter(Boolean)
	}
	if (typeof raw === 'string') {
		try {
			const j = JSON.parse(raw) as unknown
			if (Array.isArray(j)) {
				return j.map(line).filter(Boolean)
			}
		} catch {
			return []
		}
	}
	return []
}

function parseMemUnitStringToGb(s: string): number | null {
	const parts = s
		.trim()
		.replace(/,/g, '')
		.split(/\s+/)
		.filter(Boolean)
	if (!parts.length) return null
	const n = Number.parseFloat(parts[0])
	if (!Number.isFinite(n) || n < 0) return null
	const unit = parts.slice(1).join('').toLowerCase() || 'mib'
	if (unit.startsWith('t'))
		return unit.includes('ib') ? n * 1024 : n * 1000
	if (unit.startsWith('g')) return n
	if (unit.startsWith('m'))
		return unit.includes('ib') || unit.endsWith('mib') ? n / 1024 : n / 1000
	if (unit.startsWith('k'))
		return unit.includes('ib') || unit.endsWith('kib') ? n / 1024 ** 2 : n / 1_000_000
	if (unit === 'b') return n / 1024 ** 3
	return n / 1024
}

/** Heuristic: large numbers treated as bytes; typical JVM `-Xmx` MiB heap values treated as MiB. */
function inferNumericMemToGb(n: number): number | null {
	if (!Number.isFinite(n) || n <= 0) return null
	if (n >= 104_857_600) return n / 1024 ** 3
	return n / 1024
}

function formatGbNearestHundredth(gb: number): string {
	const rounded = Math.round(gb * 100) / 100
	return `${rounded.toFixed(2)} GB`
}

/** Parse Crafty/memory stats fields into `{value}.{value} GB` (nearest 0.01 GB). */
export function craftyFormatMemoryGb(stats: CraftyStats | undefined): string | undefined {
	if (!stats) return undefined

	const candidates: unknown[] = [
		stats.mem,
		stats.memory,
		stats.memory_used,
		stats.used_memory,
		stats.heap_used,
		stats.rss_memory,
	]

	for (const c of candidates) {
		if (typeof c === 'string' && c.trim()) {
			const fromStr = parseMemUnitStringToGb(c)
			if (fromStr != null) return formatGbNearestHundredth(fromStr)
		}
		if (typeof c === 'number') {
			const gb = inferNumericMemToGb(c)
			if (gb != null) return formatGbNearestHundredth(gb)
		}
	}

	return undefined
}
