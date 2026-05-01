/** Normalize Crafty `POST /servers/:id/files` responses into UI rows. */



export type CraftyFileRow = {

	/** Preferred path segment or full relative path when opening directories. */

	key: string

	displayName: string

	isDirectory: boolean

	raw: Record<string, unknown>

}



function pickStr(o: Record<string, unknown>, ...keys: string[]): string | undefined {

	for (const k of keys) {

		const v = o[k]

		if (typeof v === 'string' && v) return v

	}

	return undefined

}



/** Case-insensitive name/path fields some Crafty builds use (`Name`, `File_Name`, …). */

function pickInsensitiveString(o: Record<string, unknown>, allowed: readonly string[]): string | undefined {

	const allow = new Set(allowed.map((s) => s.toLowerCase()))

	for (const [k, v] of Object.entries(o)) {

		if (typeof v !== 'string' || !v.trim()) continue

		if (allow.has(k.toLowerCase())) return v.trim()

	}

	return undefined

}



function normalizeEntry(o: Record<string, unknown>): CraftyFileRow | null {

	let displayName =

		pickStr(o, 'name', 'filename', 'basename', 'file_name', 'relative_path') ??

		pickInsensitiveString(o, ['Name', 'Filename', 'File_Name', 'basename']) ??

		''

	let pathKey =

		pickStr(o, 'path', 'relative_path', 'fullname', 'file_path') ??

		pickInsensitiveString(o, ['Path', 'FullName', 'file_path'])

	const dir =

		o.directory === true ||

		o.directory === 'true' ||

		o.directory === 'directory' ||

		o.dir === true ||

		o.type === 'directory' ||

		o.kind === 'dir'

	pathKey ||= displayName



	if (!displayName && typeof pathKey === 'string')

		displayName = pathKey.split(/[/\\]/).filter(Boolean).pop() ?? pathKey



	if (!displayName && !pathKey) return null



	const key = pathKey || displayName

	return {

		key,

		displayName: displayName || key,

		isDirectory: !!dir,

		raw: o,

	}

}



function asRecordArray(raw: unknown): Record<string, unknown>[] {

	if (Array.isArray(raw)) {

		return raw.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')

	}

	if (raw && typeof raw === 'object') {

		const v = (raw as { files?: unknown; listing?: unknown; children?: unknown; data?: unknown })

			.files ??

			(raw as { listing?: unknown }).listing ??

			(raw as { children?: unknown }).children

		return asRecordArray(v)

	}

	return []

}



/** Unwrap common `{ status, data }` envelopes; tolerate boolean status and missing `status` on success. */

export function craftyUnwrapEnvelope(res: Record<string, unknown>): unknown {

	const st = res.status

	if (typeof st === 'boolean') {

		if (!st) return res

		if (res.data !== undefined && res.data !== null) return res.data

		return res

	}

	if (typeof st === 'string') {

		const s = st.toLowerCase()

		if (s === 'error' || s === 'failed' || s === 'fail') return res

		if (res.data !== undefined && res.data !== null) return res.data

		return res

	}

	if (res.data !== undefined && res.data !== null) return res.data

	return res

}



/** True when Crafty reported a hard failure (do not treat missing status as error). */

export function craftyFilesResponseIsError(res: Record<string, unknown>): boolean {

	const st = res.status

	if (st === false) return true

	if (typeof st === 'string') {

		const s = st.toLowerCase()

		return s === 'error' || s === 'failed' || s === 'fail'

	}

	return false

}



function listingRowFromFilename(nameOrPath: string, isDirectory: boolean): CraftyFileRow {

	const normalized = nameOrPath.replace(/\\/g, '/')

	const displayName =

		normalized.split('/').filter(Boolean).pop() || normalized.trim() || nameOrPath

	return {

		key: normalized.replace(/^\/+|\/+$/g, ''),

		displayName,

		isDirectory,

		raw: { name: displayName, path: normalized, directory: isDirectory },

	}

}



/** Crafty often returns `"files":["a.jar"]` instead of `{ name }` rows — preserve strings. */

function expandMixedPathEntries(items: unknown[], stringsAreDirectories: boolean): CraftyFileRow[] {

	const out: CraftyFileRow[] = []

	for (const item of items) {

		if (typeof item === 'string') {

			const s = item.replace(/\\/g, '/').trim()

			if (s) out.push(listingRowFromFilename(s, stringsAreDirectories))

		} else if (item && typeof item === 'object' && !Array.isArray(item)) {

			const row = normalizeEntry(item as Record<string, unknown>)

			if (row) out.push(row)

		}

	}

	return out

}



function dedupeCraftyRows(rows: CraftyFileRow[]): CraftyFileRow[] {

	const seen = new Set<string>()

	const out: CraftyFileRow[] = []

	for (const r of rows) {

		const k = `${r.isDirectory ? 'd' : 'f'}:${r.key}`

		if (seen.has(k)) continue

		seen.add(k)

		out.push(r)

	}

	return out

}



function mergeCraftySplitListing(o: Record<string, unknown>): CraftyFileRow[] {

	const merged: CraftyFileRow[] = []

	const dirs = ['directory_list', 'folder_list'] as const

	const fileLikeKeys = ['file_list', 'files_list'] as const

	for (const k of dirs) {

		const raw = o[k]

		if (!Array.isArray(raw)) continue

		for (const item of raw) {

			if (typeof item === 'string')

				merged.push(listingRowFromFilename(item, true))

			else if (item && typeof item === 'object') {

				const row = normalizeEntry(item as Record<string, unknown>)

				if (row) merged.push(row.isDirectory ? row : { ...row, isDirectory: true })

			}

		}

	}

	for (const k of fileLikeKeys) {

		const raw = o[k]

		if (!Array.isArray(raw)) continue

		for (const item of raw) {

			if (typeof item === 'string') merged.push(listingRowFromFilename(item, false))

			else if (item && typeof item === 'object') {

				const row = normalizeEntry(item as Record<string, unknown>)

				if (row) merged.push(row)

			}

		}

	}

	return merged

}



/** Crafty directory POST returns `{ root_path, mods: { path, dir, … }, jar: { … } }` keyed by basename. */


function listingRowsFromFilenameKeyedMaps(o: Record<string, unknown>): CraftyFileRow[] {

	const out: CraftyFileRow[] = []

	for (const [filename, v] of Object.entries(o)) {

		if (!v || typeof v !== 'object' || Array.isArray(v)) continue

		const rv = v as Record<string, unknown>

		if (!('dir' in rv)) continue

		const row = normalizeEntry({ ...rv, name: pickStr(rv, 'name', 'filename') ?? filename })

		if (row) out.push(row)

	}

	return out

}



function sortRows(rows: CraftyFileRow[]): CraftyFileRow[] {

	return [...rows].sort((a, b) => {

		if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

		return a.displayName.localeCompare(b.displayName)

	})

}



export function craftyParseListing(res: Record<string, unknown>): CraftyFileRow[] {

	const inner = craftyUnwrapEnvelope(res)



	if (Array.isArray(inner)) {

		const fromArr: CraftyFileRow[] = []

		for (const item of inner) {

			if (typeof item === 'string') fromArr.push(listingRowFromFilename(item, false))

			else if (item && typeof item === 'object') {

				const r = normalizeEntry(item as Record<string, unknown>)

				if (r) fromArr.push(r)

			}

		}

		return sortRows(fromArr)

	}



	if (inner && typeof inner === 'object' && !Array.isArray(inner)) {

		const o = inner as Record<string, unknown>



		let rows = mergeCraftySplitListing(o)

		rows = rows.concat(listingRowsFromFilenameKeyedMaps(o))

		const dirKeyArrays = ['directories', 'dirs', 'folders', 'folders_list'] as const

		for (const dk of dirKeyArrays) {

			const raw = o[dk]

			if (Array.isArray(raw)) rows = rows.concat(expandMixedPathEntries(raw, true))

		}



		const filesRaw = o.files

		if (Array.isArray(filesRaw)) rows = rows.concat(expandMixedPathEntries(filesRaw, false))



		const listingKeys = ['listing', 'children', 'items', 'entries'] as const

		for (const lk of listingKeys) {

			const raw = o[lk]

			if (Array.isArray(raw)) rows = rows.concat(expandMixedPathEntries(raw, false))

		}



		rows = dedupeCraftyRows(rows)



		// Some builds nest an extra `{ result: { files: [...] } }` layer.

		if (

			!rows.length &&

			o.result &&

			typeof o.result === 'object' &&

			!Array.isArray(o.result) &&

			o.result !== o

		)

			return craftyParseListing(o.result as Record<string, unknown>)



		const nested = pickStr(o, 'cwd', 'path', 'current_path')

		if (

			!rows.length &&

			typeof o === 'object' &&

			(o.contents !== undefined || o.content !== undefined)

		) {

			const c = typeof o.contents === 'string' ? o.contents : typeof o.content === 'string' ? o.content : ''

			const p = nested ?? ''

			if (p) {

				return [

					{

						key: p,

						displayName: p.split(/[/\\]/).pop() ?? p,

						isDirectory: false,

						raw: { ...o, _decryptedContent: c },

					},

				]

			}

		}



		return sortRows(rows)

	}



	const list = asRecordArray(inner)

	return sortRows(

		list.map(normalizeEntry).filter(Boolean) as CraftyFileRow[],

	)

}



export function craftyFileContentsFromBrowse(dataInner: Record<string, unknown>): string | null {

	const c =

		dataInner.contents ??

		dataInner.content ??

		dataInner.data ??

		dataInner.text ??

		dataInner.body

	if (typeof c === 'string') return c

	if (c && typeof c === 'object' && typeof (c as { text?: string }).text === 'string')

		return (c as { text?: string }).text ?? null

	return null

}



export function craftyJoinPath(dir: string, name: string): string {

	const d = (dir ?? '').replace(/\\/g, '/').replace(/\/$/, '')

	const n = (name ?? '').replace(/^[/\\]+/, '')

	if (!d) return n

	if (!n) return d

	return `${d}/${n}`

}

