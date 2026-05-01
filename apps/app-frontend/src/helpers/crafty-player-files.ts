import { craftyFileContentsFromBrowse, craftyFilesResponseIsError } from './crafty-files'

export const CRAFTY_WHITELIST_JSON_PATHS = ['whitelist.json', 'world/whitelist.json']
export const CRAFTY_OPS_JSON_PATHS = ['ops.json', 'world/ops.json']
export const CRAFTY_BANNED_PLAYERS_JSON_PATHS = ['banned-players.json', 'world/banned-players.json']

export async function craftyTryReadServerTextFile(
	browse: (path: string) => Promise<Record<string, unknown>>,
	candidates: string[],
): Promise<{ path: string; text: string } | null> {
	for (const path of candidates) {
		try {
			const res = await browse(path)
			if (craftyFilesResponseIsError(res)) continue
			const inner = res.data ?? res
			const rec =
				inner && typeof inner === 'object' && !Array.isArray(inner)
					? (inner as Record<string, unknown>)
					: null
			if (!rec) continue
			const txt = craftyFileContentsFromBrowse(rec)
			if (typeof txt === 'string' && txt.trim()) return { path, text: txt.trim() }
		} catch {
			continue
		}
	}
	return null
}

export type CraftyWhitelistRow = { uuid?: string; name: string }

export function craftyParseWhitelistJson(text: string): CraftyWhitelistRow[] {
	let j: unknown
	try {
		j = JSON.parse(text) as unknown
	} catch {
		return []
	}
	const rows: CraftyWhitelistRow[] = []
	const push = (o: unknown) => {
		if (!o || typeof o !== 'object') return
		const r = o as Record<string, unknown>
		const name = r.name
		if (typeof name !== 'string' || !name.trim()) return
		const uuid = typeof r.uuid === 'string' ? r.uuid : undefined
		rows.push({ uuid, name: name.trim() })
	}
	if (Array.isArray(j)) {
		for (const item of j) push(item)
		return rows
	}
	if (typeof j === 'object' && j !== null && 'players' in j) {
		const p = (j as { players?: unknown }).players
		if (Array.isArray(p)) for (const item of p) push(item)
	}
	return rows
}

export type CraftyOpsRow = { uuid?: string; name: string; level?: number; bypassesPlayerLimit?: boolean }

export function craftyParseOpsJson(text: string): CraftyOpsRow[] {
	let j: unknown
	try {
		j = JSON.parse(text) as unknown
	} catch {
		return []
	}
	if (!Array.isArray(j)) return []
	const out: CraftyOpsRow[] = []
	for (const item of j) {
		if (!item || typeof item !== 'object') continue
		const r = item as Record<string, unknown>
		const name = r.name
		if (typeof name !== 'string' || !name.trim()) continue
		out.push({
			uuid: typeof r.uuid === 'string' ? r.uuid : undefined,
			name: name.trim(),
			level: typeof r.level === 'number' ? r.level : undefined,
			bypassesPlayerLimit: typeof r.bypassesPlayerLimit === 'boolean' ? r.bypassesPlayerLimit : undefined,
		})
	}
	return out
}

export type CraftyBannedRow = {
	uuid?: string
	name: string
	created?: string
	source?: string
	expires?: string
	reason?: string
}

export function craftyParseBannedPlayersJson(text: string): CraftyBannedRow[] {
	let j: unknown
	try {
		j = JSON.parse(text) as unknown
	} catch {
		return []
	}
	if (!Array.isArray(j)) return []
	const out: CraftyBannedRow[] = []
	for (const item of j) {
		if (!item || typeof item !== 'object') continue
		const r = item as Record<string, unknown>
		const name = r.name
		if (typeof name !== 'string' || !name.trim()) continue
		out.push({
			uuid: typeof r.uuid === 'string' ? r.uuid : undefined,
			name: name.trim(),
			created: typeof r.created === 'string' ? r.created : undefined,
			source: typeof r.source === 'string' ? r.source : undefined,
			expires: typeof r.expires === 'string' ? r.expires : undefined,
			reason: typeof r.reason === 'string' ? r.reason : undefined,
		})
	}
	return out
}

/** Escape a Minecraft player name for console commands (quote if needed). */
export function craftyMcPlayerArg(name: string): string {
	const t = name.trim()
	if (!t) return ''
	if (/\s/.test(t)) return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
	return t
}
