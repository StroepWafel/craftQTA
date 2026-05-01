import dayjs from 'dayjs'

/**
 * Normalize Crafty's `GET …/servers/:id/history` payload into Apex-friendly time series.
 * Upstream varies (array rows, keyed objects, envelopes); keep heuristics defensive.
 */

const TIME_FIELDS = [
	'time',
	'timestamp',
	'epoch',
	'datetime',
	'created',
	'recorded',
	'date',
	'_t',
	'recorded_at',
	'as_of',
	'logged_at',
] as const

const ROW_ID_KEYS = new Set(['id', '_id'])

/** Envelope unwrap (same spirit as crafty files/schedules helpers). */
export function craftyUnpackHistoryEnvelope(raw: unknown): unknown {
	if (raw == null) return null
	if (typeof raw !== 'object') return raw
	const o = raw as Record<string, unknown>
	const st = o.status
	if (typeof st === 'boolean' && !st) return null
	if (typeof st === 'string') {
		const lc = st.toLowerCase()
		if (lc === 'error' || lc === 'failed' || lc === 'fail') return null
	}
	if (o.data !== undefined && o.data !== null) return o.data
	return raw
}

function coerceNumber(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v
	if (typeof v === 'boolean') return v ? 1 : 0
	if (typeof v !== 'string') return null
	const s = v.trim().replace(',', '.')
	if (!s || !/^[\d.+-]+$/.test(s.replace(/%/g, ''))) return null
	const x = Number.parseFloat(s.replace(/%/g, ''))
	return Number.isFinite(x) ? x : null
}

function timestampMsFromCell(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) {
		return v >= 12_300_000_000_000 ? v : v * 1000 // sec vs ms
	}
	if (typeof v !== 'string' || !v.trim()) return null
	const d = dayjs(v)
	if (d.isValid()) return d.valueOf()
	const n = Number(v)
	return Number.isFinite(n) ? (n >= 12_300_000_000_000 ? n : n * 1000) : null
}

function timestampMsFromRow(row: Record<string, unknown>): number | null {
	for (const k of TIME_FIELDS) {
		if (!(k in row)) continue
		const ms = timestampMsFromCell(row[k])
		if (ms !== null) return ms
	}
	return null
}

function numericCells(row: Record<string, unknown>): Record<string, number> {
	const nums: Record<string, number> = {}
	for (const [k, v] of Object.entries(row)) {
		if (ROW_ID_KEYS.has(k)) continue
		if ((TIME_FIELDS as readonly string[]).includes(k)) continue
		const n = coerceNumber(v)
		if (n !== null) nums[k] = n
	}
	return nums
}

function flattenHistoryRows(inner: unknown): Record<string, unknown>[] {
	if (inner == null) return []
	if (Array.isArray(inner)) {
		return inner.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
	}
	if (typeof inner !== 'object') return []
	const obj = inner as Record<string, unknown>

	const arrayPairs = Object.entries(obj).filter(
		(arr): arr is [string, unknown[]] =>
			Array.isArray(arr[1]) && arr[1].length > 0 && arr[1].every((x) => x != null),
	)
	const parallelLen =
		arrayPairs.length >= 2 ? new Set(arrayPairs.map(([, a]) => a.length)).size : 0
	if (parallelLen === 1 && arrayPairs.length >= 2) {
		const n = arrayPairs[0][1].length
		const rowsParallel: Record<string, unknown>[] = []
		for (let i = 0; i < n; i++) {
			const row: Record<string, unknown> = {}
			for (const [k, arr] of arrayPairs) row[k] = arr[i]
			rowsParallel.push(row)
		}
		return rowsParallel
	}

	// Map of snapshot objects keyed by epoch / ISO stamp (Crafty helpers sometimes use this layout)
	const entryPairs = Object.entries(obj).filter(
		([, v]) => v && typeof v === 'object' && !Array.isArray(v),
	) as [string, Record<string, unknown>][]
	if (entryPairs.length > 0) {
		const keyedRows = entryPairs.map(([k, base]) =>
			timestampMsFromRow(base) === null && (/[-:T]|^\d{10,}$/.test(k) || Number.isFinite(Number(k)))
				? { ...base, datetime: base.datetime ?? k }
				: { ...base },
		)
		return keyedRows
	}

	// Common containers
	for (const k of ['records', 'samples', 'points', 'items', 'entries', 'history'] as const) {
		const v = obj[k]
		if (Array.isArray(v)) return flattenHistoryRows(v)
	}
	return []
}

const METRIC_ORDER: string[] = [
	'cpu',
	'cpu_percent',
	'cpu_usage',
	'mem_percent',
	'mem_usage_percent',
	'memory_percent',
	'players',
	'online',
	'max_players',
	'tps',
	'mspt',
]

function orderedMetricKeys(keys: Set<string>): string[] {
	const pick = METRIC_ORDER.filter((k) => keys.has(k))
	const rest = [...keys].filter((k) => !METRIC_ORDER.includes(k)).sort()
	return [...pick, ...rest]
}

export type CraftyHistorySeries = { metricKey: string; data: number[] }

export type CraftyHistoryChartPayload = {
	labelsMs: number[]
	series: CraftyHistorySeries[]
	sampleCount: number
	hasRenderableChart: boolean
}

export function craftyHistoryChartPayload(inner: unknown): CraftyHistoryChartPayload {
	const rows = flattenHistoryRows(inner)
	type Tagged = { t: number; n: Record<string, number> }
	const tagged: Tagged[] = []

	let syntheticT = Date.now()

	for (const row of rows) {
		const nums = numericCells(row)
		if (!Object.keys(nums).length) continue
		let t = timestampMsFromRow(row)
		if (t === null) {
			t = syntheticT
			syntheticT -= 60_000
		}
		tagged.push({ t, n: nums })
	}

	tagged.sort((a, b) => a.t - b.t)

	const merged = new Map<number, Record<string, number>>()
	for (const { t, n } of tagged) {
		const prev = merged.get(t) ?? {}
		merged.set(t, { ...prev, ...n })
	}

	const labelsMs = [...merged.keys()].sort((a, b) => a - b)
	const allKeys = new Set<string>()
	for (const ms of labelsMs) {
		Object.keys(merged.get(ms)! || {}).forEach((k) => allKeys.add(k))
	}

	const metricKeys = orderedMetricKeys(allKeys)
	const series: CraftyHistorySeries[] = metricKeys.map((metricKey) => ({
		metricKey,
		data: labelsMs.map((ms) => merged.get(ms)?.[metricKey] ?? NaN),
	}))

	const cleanedSeries = series.map((s) => ({
		metricKey: s.metricKey,
		data: s.data.map((v) => (Number.isFinite(v) ? v : 0)),
	}))

	return {
		labelsMs,
		series: cleanedSeries.slice(0, 12),
		sampleCount: labelsMs.length,
		hasRenderableChart: labelsMs.length >= 2 && cleanedSeries.length > 0,
	}
}

export function craftyMetricLooksPercent(metricKey: string): boolean {
	const k = metricKey.toLowerCase()
	return (
		k.includes('percent') ||
		k.endsWith('_pct') ||
		k === 'cpu' ||
		k.endsWith('_usage') ||
		k.includes('usage_percent')
	)
}
