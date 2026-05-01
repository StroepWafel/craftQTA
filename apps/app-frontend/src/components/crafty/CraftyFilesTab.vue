<script setup lang="ts">
import { ButtonStyled, ConfirmModal } from '@modrinth/ui'
import { injectModrinthClient } from '@modrinth/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
	craftyFileContentsFromBrowse,
	craftyFilesResponseIsError,
	craftyJoinPath,
	craftyParseListing,
	type CraftyFileRow,
} from '@/helpers/crafty-files'

const props = defineProps<{
	serverId: string
	craftyApiCacheKey: string
	craftyJwtKey: string
}>()

const { t } = useI18n()
const client = injectModrinthClient()
const qc = useQueryClient()

const browsePath = ref('')
const breadcrumbs = computed(() => {
	const p = browsePath.value.trim()
	if (!p) return []
	return p.replace(/\\/g, '/').split('/').filter(Boolean)
})

async function crumbNav(index: number) {
	const bc = breadcrumbs.value
	if (index < 0) browsePath.value = ''
	else browsePath.value = bc.slice(0, index + 1).join('/')
	selectedPath.value = null
	editContent.value = ''
	editDirty.value = false
	await filesQuery.refetch()
}

const filesQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'files',
		props.serverId,
		browsePath.value,
		props.craftyJwtKey,
		props.craftyApiCacheKey,
	]),
	queryFn: async () => {
		const pRaw = browsePath.value.replace(/\\/g, '/')
		const trimmed = pRaw.replace(/^\/+|\/+$/g, '')

		const bodies: Record<string, string>[] = [
			{ path: trimmed },
			{ path: trimmed === '' ? '/' : trimmed },
			...(trimmed ? [{ path: trimmed, cwd: trimmed }] : [{ browse_path: '' }]),
		]

		async function fetchPrimary(body: Record<string, string>) {
			return client.crafty.v2.browseServerFiles(props.serverId, body) as Promise<
				Record<string, unknown>
			>
		}
		async function fetchList(body: Record<string, string>) {
			return client.crafty.v2.browseServerFilesList(props.serverId, body) as Promise<
				Record<string, unknown>
			>
		}

		let lastOkResponse: Record<string, unknown> | null = null
		let lastErrorText: string | null = null
		let gotHttp = false

		for (const fetchFn of [fetchPrimary, fetchList]) {
			for (const body of bodies) {
				let raw: Record<string, unknown>
				try {
					raw = await fetchFn(body)
					gotHttp = true
				} catch {
					continue
				}

				lastOkResponse = raw

				if (craftyFilesResponseIsError(raw)) {
					lastErrorText =
						(raw.error as string) ??
						(raw.error_data as string) ??
						(typeof raw.message === 'string' ? raw.message : null)
					continue
				}

				const rows = craftyParseListing(raw)
				if (rows.length) return rows
			}
		}

		if (lastErrorText) throw new Error(lastErrorText)
		if (!gotHttp) throw new Error('Could not reach Crafty files API')

		return lastOkResponse ? craftyParseListing(lastOkResponse) : []
	},
	enabled: computed(() => Boolean(props.serverId && props.craftyJwtKey)),
	staleTime: 3000,
})

const selectedPath = ref<string | null>(null)
const editContent = ref('')
const editDirty = ref(false)
const fileBusy = ref(false)
const fileLoadError = ref<string | null>(null)
const fileBinaryBlocked = ref(false)

const opsError = ref<string | null>(null)

function openDirectory(name: string) {
	browsePath.value = craftyJoinPath(browsePath.value, name.replace(/^[/\\]+/, ''))
	selectedPath.value = null
	editContent.value = ''
	editDirty.value = false
	void filesQuery.refetch()
}

watch(selectedPath, async (sel) => {
	fileLoadError.value = null
	fileBinaryBlocked.value = false
	editContent.value = ''
	editDirty.value = false
	if (!sel) return
	fileBusy.value = true
	try {
		const res = (await client.crafty.v2.browseServerFiles(props.serverId, {
			path: sel,
		})) as Record<string, unknown>
		if (craftyFilesResponseIsError(res)) {
			fileLoadError.value = (res.error as string) ?? (res.error_data as string) ?? 'Files'
			return
		}
		const inner = res.data ?? res
		const rec =
			inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : null
		if (!rec) {
			fileLoadError.value = t('app.crafty-servers.files-panel-error')
			return
		}
		const txt = craftyFileContentsFromBrowse(rec)
		if (recordLooksBinary(rec)) {
			fileBinaryBlocked.value = true
			editContent.value = ''
			return
		}
		if (txt == null) {
			editContent.value = typeof inner === 'object' ? JSON.stringify(inner, null, 2) : String(inner ?? '')
			return
		}
		editContent.value = txt
	} catch (e) {
		fileLoadError.value = e instanceof Error ? e.message : String(e)
	} finally {
		fileBusy.value = false
	}
})

function recordLooksBinary(rec: Record<string, unknown>): boolean {
	const s = typeof rec.size === 'number' ? rec.size : Number(rec.size ?? 0)
	return s > 2_500_000
}

function openItem(row: CraftyFileRow) {
	if (row.isDirectory) {
		openDirectory(row.displayName)
		return
	}
	selectedPath.value = craftyJoinPath(browsePath.value, row.displayName)
}

function directoryRowHighlighted(row: CraftyFileRow): boolean {
	const here = craftyJoinPath(browsePath.value, row.displayName)
	return selectedPath.value === here
}

const saveMutation = useMutation({
	mutationFn: async () => {
		const sel = selectedPath.value
		if (!sel || !editDirty.value) return
		const res = await client.crafty.v2.updateServerFile(props.serverId, {
			path: sel,
			contents: editContent.value,
			overwrite: true,
		})
		if ((res.status as string)?.toLowerCase?.() !== 'ok')
			throw new Error(res.error ?? res.error_data ?? t('app.crafty-servers.save-failed'))
	},
	onSuccess: () => {
		editDirty.value = false
		void qc.invalidateQueries({ queryKey: ['crafty', 'files', props.serverId] })
	},
})

const mkdirName = ref('')
const mkfileName = ref('')
const mkBusy = ref(false)

async function createDirectoryNow() {
	const name = mkdirName.value.trim()
	if (!name) return
	mkBusy.value = true
	opsError.value = null
	try {
		const parent = browsePath.value
		const res = await client.crafty.v2.createServerFileEntry(props.serverId, {
			parent,
			name,
			directory: true,
		})
		if ((res.status as string)?.toLowerCase?.() !== 'ok')
			throw new Error(res.error ?? res.error_data ?? '')
		mkdirName.value = ''
		await filesQuery.refetch()
	} catch (e) {
		opsError.value = e instanceof Error ? e.message : String(e)
	} finally {
		mkBusy.value = false
	}
}

async function createFileNow() {
	const name = mkfileName.value.trim()
	if (!name) return
	mkBusy.value = true
	opsError.value = null
	try {
		const parent = browsePath.value
		const res = await client.crafty.v2.createServerFileEntry(props.serverId, {
			parent,
			name,
			directory: false,
		})
		if ((res.status as string)?.toLowerCase?.() !== 'ok')
			throw new Error(res.error ?? res.error_data ?? '')
		mkfileName.value = ''
		await filesQuery.refetch()
	} catch (e) {
		opsError.value = e instanceof Error ? e.message : String(e)
	} finally {
		mkBusy.value = false
	}
}

const deleteConfirm = ref<InstanceType<typeof ConfirmModal> | null>(null)
function askDeleteSelection() {
	if (!selectedPath.value) return
	deleteConfirm.value?.show()
}

async function confirmDeleteSelection() {
	const p = selectedPath.value
	if (!p) return
	const res = await client.crafty.v2.deleteServerFilePaths(props.serverId, [p])
	if ((res.status as string)?.toLowerCase?.() !== 'ok') {
		opsError.value = res.error ?? res.error_data ?? t('app.crafty-servers.delete-failed')
		return
	}
	selectedPath.value = null
	editContent.value = ''
	await filesQuery.refetch()
}

const decompressFolder = ref('')

async function decompressNow() {
	const folder = decompressFolder.value.trim()
	if (!folder) return
	mkBusy.value = true
	opsError.value = null
	try {
		const full = craftyJoinPath(browsePath.value, folder)
		const res = await client.crafty.v2.decompressServerArchive(props.serverId, full || folder)
		if ((res.status as string)?.toLowerCase?.() !== 'ok')
			throw new Error(res.error ?? res.error_data ?? '')
		await filesQuery.refetch()
	} catch (e) {
		opsError.value = e instanceof Error ? e.message : String(e)
	} finally {
		mkBusy.value = false
	}
}

const rows = computed(() => filesQuery.data.value ?? [])
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="m-0 text-sm text-secondary">
			{{ t('app.crafty-servers.files-intro') }}
		</p>
		<p v-if="opsError" class="m-0 rounded-xl border border-orange bg-bg-orange px-3 py-2 text-sm text-primary">
			{{ opsError }}
		</p>
		<p
			v-if="fileLoadError"
			class="m-0 rounded-xl border border-red bg-bg-red/40 px-3 py-2 text-sm text-primary"
		>
			{{ fileLoadError }}
		</p>


		<!-- Breadcrumbs -->
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<button
				type="button"
				class="rounded-lg border border-divider px-2 py-1 hover:bg-bg-secondary"
				@click="void crumbNav(-1)"
			>
				{{ t('app.crafty-servers.files-root') }}
			</button>
			<template v-for="(segment, idx) in breadcrumbs" :key="idx">
				<span class="text-secondary">/</span>
				<button
					type="button"
					class="rounded-lg border border-divider px-2 py-1 hover:bg-bg-secondary"
					@click="void crumbNav(idx)"
				>
					{{ segment }}
				</button>
			</template>
		</div>

		<!-- Quick ops -->
		<div class="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-raised p-4 lg:flex-row">
			<div class="flex flex-1 flex-wrap items-end gap-2">
				<label class="flex flex-col gap-1 text-xs text-secondary">
					<span>{{ t('app.crafty-servers.new-folder') }}</span>
					<input
						v-model="mkdirName"
						class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
						type="text"
					/>
				</label>
				<ButtonStyled color="brand" type="standard">
					<button type="button" :disabled="mkBusy || !mkdirName.trim()" @click="createDirectoryNow">
						{{ t('app.crafty-servers.create-folder') }}
					</button>
				</ButtonStyled>
			</div>
			<div class="flex flex-1 flex-wrap items-end gap-2 border-0 border-t border-divider pt-3 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
				<label class="flex flex-col gap-1 text-xs text-secondary">
					<span>{{ t('app.crafty-servers.new-empty-file') }}</span>
					<input
						v-model="mkfileName"
						class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
						type="text"
					/>
				</label>
				<ButtonStyled type="standard">
					<button type="button" :disabled="mkBusy || !mkfileName.trim()" @click="createFileNow">
						{{ t('app.crafty-servers.create-file') }}
					</button>
				</ButtonStyled>
			</div>
			<div class="flex flex-1 flex-col gap-1 border-0 border-t border-divider pt-3 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
				<label class="text-xs text-secondary">{{ t('app.crafty-servers.decompress-archive') }}</label>
				<div class="flex flex-wrap gap-2">
					<input
						v-model="decompressFolder"
						class="min-w-[160px] flex-1 rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
						type="text"
						:placeholder="t('app.crafty-servers.relative-path')"
					/>
					<ButtonStyled type="standard">
						<button type="button" :disabled="mkBusy || !decompressFolder.trim()" @click="decompressNow">
							{{ t('app.crafty-servers.unpack') }}
						</button>
					</ButtonStyled>
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-3 lg:flex-row">
			<div class="flex min-h-[280px] min-w-[200px] flex-1 flex-col rounded-2xl border border-divider bg-bg-raised p-0">
				<p class="border-0 border-b border-divider px-4 py-2 text-xs font-semibold uppercase text-secondary">
					{{ t('app.crafty-servers.file-list') }}
				</p>
				<p v-if="filesQuery.isPending.value" class="px-4 py-3 text-sm text-secondary">
					{{ t('app.crafty-servers.loading-files') }}
				</p>
				<p v-else-if="filesQuery.isError.value" class="px-4 py-3 text-sm text-orange">
					{{ filesQuery.error instanceof Error ? filesQuery.error.message : String(filesQuery.error) }}
				</p>
				<ul v-else class="m-0 max-h-[420px] list-none overflow-y-auto p-2">
					<li v-for="row in rows" :key="row.key + row.displayName">
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-bg-secondary"
							:class="
								row.isDirectory ? '' : directoryRowHighlighted(row)
									? 'bg-brand-highlight/30'
									: ''
							"
							@click="openItem(row)"
						>

							<span class="font-mono text-secondary">{{ row.isDirectory ? '📁' : '📄' }}</span>
							<span class="truncate text-primary">{{ row.displayName }}</span>
						</button>
					</li>
					<li v-if="rows.length === 0" class="px-3 py-4 text-sm text-secondary">{{ t('app.crafty-servers.empty-dir') }}</li>
				</ul>
			</div>

			<div class="flex min-h-[280px] flex-[1.35] flex-col rounded-2xl border border-divider bg-bg-raised p-4">
				<p class="m-0 text-xs font-semibold uppercase text-secondary">{{ t('app.crafty-servers.editor') }}</p>
				<p v-if="!selectedPath" class="mt-3 text-sm text-secondary">{{ t('app.crafty-servers.pick-file') }}</p>
				<template v-else>
					<p class="m-0 mt-2 font-mono text-xs text-secondary break-all">{{ selectedPath }}</p>
					<p v-if="fileBusy" class="text-sm text-secondary">{{ t('app.crafty-servers.loading-file') }}</p>
					<p v-else-if="fileBinaryBlocked" class="mt-3 text-sm text-secondary">
						{{ t('app.crafty-servers.files-binary-hint') }}
					</p>
					<textarea
						v-else-if="!fileLoadError"
						v-model="editContent"

						class="mt-3 min-h-[220px] w-full flex-1 rounded-xl border border-divider bg-bg p-3 font-mono text-xs outline-none focus:border-brand"
						@input="editDirty = true"
					/>
					<div v-if="!fileBusy && !fileBinaryBlocked && !fileLoadError" class="mt-3 flex flex-wrap gap-2">

						<ButtonStyled color="brand">
							<button
								type="button"
								:disabled="!editDirty || saveMutation.isPending.value"
								@click="saveMutation.mutate()"
							>
								{{ t('app.crafty-servers.save-file') }}
							</button>
						</ButtonStyled>
						<ButtonStyled color="red" type="standard">
							<button type="button" @click="askDeleteSelection">{{ t('app.crafty-servers.delete-file') }}</button>
						</ButtonStyled>
					</div>
				</template>
			</div>
		</div>

		<ConfirmModal
			ref="deleteConfirm"
			:danger="true"
			:title="t('app.crafty-servers.delete-path-title')"
			:markdown="false"
			:description="selectedPath ?? ''"
			:proceed-label="t('app.crafty-servers.delete-proceed')"
			@proceed="confirmDeleteSelection"
		/>
	</div>
</template>
