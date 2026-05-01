<script setup lang="ts">
import type { Crafty } from '@modrinth/api-client'

import {
	CRAFTY_BANNED_PLAYERS_JSON_PATHS,
	CRAFTY_OPS_JSON_PATHS,
	CRAFTY_WHITELIST_JSON_PATHS,
	craftyMcPlayerArg,
	craftyParseBannedPlayersJson,
	craftyParseOpsJson,
	craftyParseWhitelistJson,
	craftyTryReadServerTextFile,
	type CraftyBannedRow,
	type CraftyOpsRow,
	type CraftyWhitelistRow,
} from '@/helpers/crafty-player-files'
import { craftyParsePlayerLines, statStr } from '@/helpers/crafty-stats'

import { ButtonStyled, ConfirmModal, StyledInput } from '@modrinth/ui'
import { injectModrinthClient } from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
	serverId: string
	craftyApiCacheKey: string
	craftyJwtKey: string
}>()

const { t } = useI18n()
const client = injectModrinthClient()
const queryClient = useQueryClient()

const enabled = computed(() => Boolean(props.serverId && props.craftyJwtKey))

const statsQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'server',
		props.serverId,
		'stats',
		props.craftyJwtKey,
		props.craftyApiCacheKey,
	]),
	queryFn: async (): Promise<Crafty.v2.ServerStats> => {
		const res = await client.crafty.v2.getStats(props.serverId)
		if (res.status !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? t('app.crafty-servers.err-load-stats'))
		}
		return res.data ?? {}
	},
	enabled,
	refetchInterval: computed(() => (enabled.value ? 4000 : false)),
	retry: false,
})

const playerListsQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'player-lists',
		props.serverId,
		props.craftyJwtKey,
		props.craftyApiCacheKey,
	]),
	queryFn: async (): Promise<{
		whitelistRows: CraftyWhitelistRow[]
		whitelistPath: string | null
		opsRows: CraftyOpsRow[]
		opsPath: string | null
		bannedRows: CraftyBannedRow[]
		bannedPath: string | null
	}> => {
		const browse = (path: string) =>
			client.crafty.v2.browseServerFiles(props.serverId, { path }) as Promise<Record<string, unknown>>
		const [wl, ops, banned] = await Promise.all([
			craftyTryReadServerTextFile(browse, CRAFTY_WHITELIST_JSON_PATHS),
			craftyTryReadServerTextFile(browse, CRAFTY_OPS_JSON_PATHS),
			craftyTryReadServerTextFile(browse, CRAFTY_BANNED_PLAYERS_JSON_PATHS),
		])
		return {
			whitelistRows: wl ? craftyParseWhitelistJson(wl.text) : [],
			whitelistPath: wl?.path ?? null,
			opsRows: ops ? craftyParseOpsJson(ops.text) : [],
			opsPath: ops?.path ?? null,
			bannedRows: banned ? craftyParseBannedPlayersJson(banned.text) : [],
			bannedPath: banned?.path ?? null,
		}
	},
	enabled,
	staleTime: 8000,
	retry: false,
})

const onlinePlayers = computed(() => craftyParsePlayerLines(statsQuery.data.value?.players))
const statsBag = computed(() => statsQuery.data.value ?? {})

const playerNameDraft = ref('')
const banReasonDraft = ref('')
const actionError = ref<string | null>(null)
const stdinBusy = ref(false)

async function invalidateAfterStdin() {
	await queryClient.invalidateQueries({ queryKey: ['crafty', 'server', props.serverId, 'stats'] })
	await queryClient.invalidateQueries({
		queryKey: ['crafty', 'player-lists', props.serverId],
	})
}

async function runConsoleCommand(cmd: string): Promise<boolean> {
	actionError.value = null
	stdinBusy.value = true
	try {
		const res = await client.crafty.v2.sendStdin(props.serverId, cmd)
		const ok = typeof res.status === 'string' && res.status.toLowerCase() === 'ok'
		if (!ok) {
			actionError.value = res.error ?? res.error_data ?? t('app.crafty-servers.players-stdin-failed')
			return false
		}
		await invalidateAfterStdin()
		return true
	} catch (e) {
		actionError.value = e instanceof Error ? e.message : String(e)
		return false
	} finally {
		stdinBusy.value = false
	}
}

function trimmedTarget(): string {
	return playerNameDraft.value.trim()
}

const stdinConfirmRef = ref<InstanceType<typeof ConfirmModal> | null>(null)
type PendingStdin = { cmd: string; title: string; description: string }
const pendingStdin = ref<PendingStdin | null>(null)

function openStdinConfirm(p: PendingStdin) {
	pendingStdin.value = p
	stdinConfirmRef.value?.show()
}

async function onStdinConfirmed() {
	const p = pendingStdin.value
	pendingStdin.value = null
	if (!p?.cmd.trim()) return
	await runConsoleCommand(p.cmd)
}

function askKick(name: string) {
	const arg = craftyMcPlayerArg(name)
	if (!arg) return
	openStdinConfirm({
		title: t('app.crafty-servers.players-kick-title'),
		description: t('app.crafty-servers.players-kick-desc', { name }),
		cmd: `kick ${arg}`,
	})
}

function askKickTarget() {
	const n = trimmedTarget()
	if (!n) return
	askKick(n)
}

function askBan(name: string) {
	const arg = craftyMcPlayerArg(name)
	if (!arg) return
	const reason = banReasonDraft.value.trim() || t('app.crafty-servers.players-ban-default-reason')
	openStdinConfirm({
		title: t('app.crafty-servers.players-ban-title'),
		description: t('app.crafty-servers.players-ban-desc', { name }),
		cmd: `ban ${arg} ${reason}`,
	})
}

function askBanTarget() {
	const n = trimmedTarget()
	if (!n) return
	askBan(n)
}

function askDeop(name: string) {
	const arg = craftyMcPlayerArg(name)
	if (!arg) return
	openStdinConfirm({
		title: t('app.crafty-servers.players-deop-title'),
		description: t('app.crafty-servers.players-deop-desc', { name }),
		cmd: `deop ${arg}`,
	})
}

function askDeopTarget() {
	const n = trimmedTarget()
	if (!n) return
	askDeop(n)
}

function askPardon(name: string) {
	const arg = craftyMcPlayerArg(name)
	if (!arg) return
	openStdinConfirm({
		title: t('app.crafty-servers.players-pardon-title'),
		description: t('app.crafty-servers.players-pardon-desc', { name }),
		cmd: `pardon ${arg}`,
	})
}

async function sendOp(name: string) {
	const arg = craftyMcPlayerArg(name)
	if (!arg) return
	await runConsoleCommand(`op ${arg}`)
}

async function sendOpTarget() {
	const n = trimmedTarget()
	if (!n) return
	await sendOp(n)
}

async function whitelistAddTarget() {
	const n = trimmedTarget()
	if (!n) return
	const arg = craftyMcPlayerArg(n)
	if (!arg) return
	await runConsoleCommand(`whitelist add ${arg}`)
}

async function whitelistRemoveTarget() {
	const n = trimmedTarget()
	if (!n) return
	const arg = craftyMcPlayerArg(n)
	if (!arg) return
	await runConsoleCommand(`whitelist remove ${arg}`)
}

async function whitelistReload() {
	await runConsoleCommand('whitelist reload')
}

async function onStdinConfirmProceed() {
	await onStdinConfirmed()
}
</script>

<template>
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-2">
			<p class="m-0 max-w-3xl text-sm text-secondary">{{ t('app.crafty-servers.players-intro') }}</p>
			<p class="m-0 max-w-3xl text-sm text-secondary">{{ t('app.crafty-servers.players-java-proxy-note') }}</p>
		</div>

		<p v-if="statsQuery.isPending.value" class="m-0 text-sm text-secondary">
			{{ t('app.crafty-servers.players-loading-stats') }}
		</p>
		<p v-else-if="statsQuery.isError.value" class="m-0 text-sm text-orange">
			{{
				statsQuery.error.value instanceof Error
					? statsQuery.error.value.message
					: String(statsQuery.error.value ?? '')
			}}
		</p>
		<p v-else class="m-0 font-mono text-sm text-secondary">
			{{ t('app.crafty-servers.players-online-count') }}
			{{ statStr(statsBag, 'online') ?? t('app.crafty-servers.dash-placeholder') }} /
			{{ statStr(statsBag, 'max') ?? t('app.crafty-servers.dash-placeholder') }}
		</p>

		<p v-if="actionError" class="m-0 rounded-xl border border-orange bg-bg-orange px-3 py-2 text-sm text-primary">
			{{ actionError }}
		</p>

		<section class="rounded-2xl border border-divider bg-bg-raised p-4">
			<h3 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
				{{ t('app.crafty-servers.players-online-title') }}
			</h3>
			<p v-if="!onlinePlayers.length" class="m-0 mt-2 text-sm text-secondary">
				{{ t('app.crafty-servers.players-online-empty') }}
			</p>
			<ul v-else class="m-0 mt-3 flex list-none flex-col gap-3 p-0">
				<li
					v-for="pname in onlinePlayers"
					:key="pname"
					class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider bg-bg px-3 py-2"
				>
					<span class="m-0 font-mono text-sm font-semibold text-contrast">{{ pname }}</span>
					<div class="flex flex-wrap gap-2">
						<ButtonStyled type="standard">
							<button type="button" :disabled="stdinBusy" @click="askKick(pname)">
								{{ t('app.crafty-servers.players-act-kick') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button type="button" :disabled="stdinBusy" @click="askBan(pname)">
								{{ t('app.crafty-servers.players-act-ban') }}
							</button>
						</ButtonStyled>
						<ButtonStyled color="brand" type="standard">
							<button type="button" :disabled="stdinBusy" @click="sendOp(pname)">
								{{ t('app.crafty-servers.players-act-op') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="transparent">
							<button type="button" :disabled="stdinBusy" @click="askDeop(pname)">
								{{ t('app.crafty-servers.players-act-deop') }}
							</button>
						</ButtonStyled>
					</div>
				</li>
			</ul>
		</section>

		<section class="rounded-2xl border border-divider bg-bg-raised p-4">
			<h3 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
				{{ t('app.crafty-servers.players-target-title') }}
			</h3>
			<p class="m-0 mt-2 text-sm text-secondary">{{ t('app.crafty-servers.players-target-hint') }}</p>
			<div class="mt-3 flex flex-col gap-3">
				<StyledInput
					v-model="playerNameDraft"
					:placeholder="t('app.crafty-servers.players-placeholder')"
					wrapper-class="max-w-xl"
				/>
				<StyledInput
					v-model="banReasonDraft"
					:placeholder="t('app.crafty-servers.players-ban-reason-ph')"
					wrapper-class="max-w-xl"
				/>
				<div class="flex flex-wrap gap-2">
					<ButtonStyled type="standard">
						<button type="button" :disabled="stdinBusy" @click="askKickTarget">
							{{ t('app.crafty-servers.players-act-kick') }}
						</button>
					</ButtonStyled>
					<ButtonStyled type="standard">
						<button type="button" :disabled="stdinBusy" @click="askBanTarget">
							{{ t('app.crafty-servers.players-act-ban') }}
						</button>
					</ButtonStyled>
					<ButtonStyled color="brand" type="standard">
						<button type="button" :disabled="stdinBusy" @click="sendOpTarget">
							{{ t('app.crafty-servers.players-act-op') }}
						</button>
					</ButtonStyled>
					<ButtonStyled type="standard">
						<button type="button" :disabled="stdinBusy" @click="askDeopTarget">
							{{ t('app.crafty-servers.players-act-deop') }}
						</button>
					</ButtonStyled>
					<ButtonStyled type="transparent">
						<button type="button" :disabled="stdinBusy" @click="whitelistAddTarget">
							{{ t('app.crafty-servers.players-act-whitelist-add') }}
						</button>
					</ButtonStyled>
					<ButtonStyled type="transparent">
						<button type="button" :disabled="stdinBusy" @click="whitelistRemoveTarget">
							{{ t('app.crafty-servers.players-act-whitelist-remove') }}
						</button>
					</ButtonStyled>
					<ButtonStyled type="transparent">
						<button type="button" :disabled="stdinBusy" @click="whitelistReload">
							{{ t('app.crafty-servers.players-act-whitelist-reload') }}
						</button>
					</ButtonStyled>
				</div>
			</div>
		</section>

		<div class="flex flex-wrap items-center gap-2">
			<ButtonStyled type="standard">
				<button type="button" :disabled="playerListsQuery.isFetching.value" @click="playerListsQuery.refetch()">
					{{ t('app.crafty-servers.players-refresh-lists') }}
				</button>
			</ButtonStyled>
			<p v-if="playerListsQuery.isPending.value" class="m-0 text-sm text-secondary">
				{{ t('app.crafty-servers.players-loading-lists') }}
			</p>
			<p v-else-if="playerListsQuery.isError.value" class="m-0 text-sm text-orange">
				{{ playerListsQuery.error.value instanceof Error ? playerListsQuery.error.value.message : String(playerListsQuery.error.value ?? '') }}
			</p>
		</div>

		<section v-if="playerListsQuery.data.value" class="flex flex-col gap-5">
			<!-- Whitelist -->
			<div class="rounded-2xl border border-divider bg-bg-raised p-4">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h3 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
						{{ t('app.crafty-servers.players-whitelist-title') }}
					</h3>
					<p class="m-0 font-mono text-[11px] text-secondary">
						<template v-if="playerListsQuery.data.value.whitelistPath">
							{{ t('app.crafty-servers.players-file-path', { path: playerListsQuery.data.value.whitelistPath }) }}
						</template>
						<template v-else>
							{{ t('app.crafty-servers.players-file-missing') }}
						</template>
					</p>
				</div>
				<p v-if="!playerListsQuery.data.value.whitelistRows.length" class="m-0 mt-3 text-sm text-secondary">
					{{ t('app.crafty-servers.players-list-empty-whitelist') }}
				</p>
				<div v-else class="mt-3 overflow-x-auto">
					<table class="w-full min-w-[420px] border-collapse text-left text-sm">
						<thead class="border-0 border-b border-solid border-divider">
							<tr>
								<th class="pb-2 pr-3 font-semibold text-secondary">{{ t('app.crafty-servers.players-col-name') }}</th>
								<th class="pb-2 font-mono font-semibold text-secondary">{{ t('app.crafty-servers.players-col-uuid') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="row in playerListsQuery.data.value.whitelistRows"
								:key="`${row.uuid ?? ''}:${row.name}`"
								class="border-0 border-b border-solid border-divider last:border-b-0"
							>
								<td class="py-2 pr-3 align-top font-mono text-contrast">{{ row.name }}</td>
								<td class="py-2 align-top font-mono text-xs text-secondary">
									{{ row.uuid ?? t('app.crafty-servers.dash-placeholder') }}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- Ops -->
			<div class="rounded-2xl border border-divider bg-bg-raised p-4">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h3 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
						{{ t('app.crafty-servers.players-ops-title') }}
					</h3>
					<p class="m-0 font-mono text-[11px] text-secondary">
						<template v-if="playerListsQuery.data.value.opsPath">
							{{ t('app.crafty-servers.players-file-path', { path: playerListsQuery.data.value.opsPath }) }}
						</template>
						<template v-else>
							{{ t('app.crafty-servers.players-file-missing') }}
						</template>
					</p>
				</div>
				<p v-if="!playerListsQuery.data.value.opsRows.length" class="m-0 mt-3 text-sm text-secondary">
					{{ t('app.crafty-servers.players-list-empty-ops') }}
				</p>
				<div v-else class="mt-3 overflow-x-auto">
					<table class="w-full min-w-[480px] border-collapse text-left text-sm">
						<thead class="border-0 border-b border-solid border-divider">
							<tr>
								<th class="pb-2 pr-3 font-semibold text-secondary">{{ t('app.crafty-servers.players-col-name') }}</th>
								<th class="pb-2 pr-3 font-mono font-semibold text-secondary">{{ t('app.crafty-servers.players-col-level') }}</th>
								<th class="pb-2 font-mono font-semibold text-secondary">{{ t('app.crafty-servers.players-col-uuid') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="row in playerListsQuery.data.value.opsRows"
								:key="`${row.uuid ?? ''}:${row.name}`"
								class="border-0 border-b border-solid border-divider last:border-b-0"
							>
								<td class="py-2 pr-3 align-top font-mono text-contrast">{{ row.name }}</td>
								<td class="py-2 pr-3 align-top font-mono text-secondary">
									{{ row.level ?? t('app.crafty-servers.dash-placeholder') }}
								</td>
								<td class="py-2 align-top font-mono text-xs text-secondary">
									{{ row.uuid ?? t('app.crafty-servers.dash-placeholder') }}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- Banned -->
			<div class="rounded-2xl border border-divider bg-bg-raised p-4">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h3 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
						{{ t('app.crafty-servers.players-banned-title') }}
					</h3>
					<p class="m-0 font-mono text-[11px] text-secondary">
						<template v-if="playerListsQuery.data.value.bannedPath">
							{{ t('app.crafty-servers.players-file-path', { path: playerListsQuery.data.value.bannedPath }) }}
						</template>
						<template v-else>
							{{ t('app.crafty-servers.players-file-missing') }}
						</template>
					</p>
				</div>
				<p v-if="!playerListsQuery.data.value.bannedRows.length" class="m-0 mt-3 text-sm text-secondary">
					{{ t('app.crafty-servers.players-list-empty-banned') }}
				</p>
				<ul v-else class="m-0 mt-3 flex list-none flex-col gap-3 p-0">
					<li
						v-for="row in playerListsQuery.data.value.bannedRows"
						:key="`${row.uuid ?? ''}:${row.name}`"
						class="rounded-xl border border-divider bg-bg px-3 py-2"
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="font-mono text-sm font-semibold text-contrast">{{ row.name }}</span>
							<ButtonStyled type="transparent">
								<button type="button" :disabled="stdinBusy" @click="askPardon(row.name)">
									{{ t('app.crafty-servers.players-act-pardon') }}
								</button>
							</ButtonStyled>
						</div>
						<p v-if="row.reason" class="m-0 mt-1 font-mono text-xs text-secondary">
							{{ t('app.crafty-servers.players-reason-prefix') }} {{ row.reason }}
						</p>
						<p v-if="row.expires" class="m-0 mt-0.5 font-mono text-[11px] text-secondary">
							{{ t('app.crafty-servers.players-expires-prefix') }} {{ row.expires }}
						</p>
					</li>
				</ul>
			</div>
		</section>

		<ConfirmModal
			ref="stdinConfirmRef"
			:danger="false"
			:markdown="false"
			:title="pendingStdin?.title ?? ''"
			:description="pendingStdin?.description ?? ''"
			:proceed-label="t('app.crafty-servers.players-run-command')"
			@proceed="onStdinConfirmProceed"
		/>
	</div>
</template>
