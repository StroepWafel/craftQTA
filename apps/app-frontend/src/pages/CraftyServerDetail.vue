<script setup lang="ts">
import type { Crafty } from '@modrinth/api-client'
import { ButtonStyled, ConfirmModal, NavTabs, StyledInput } from '@modrinth/ui'
import { injectModrinthClient } from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useIntervalFn } from '@vueuse/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { config } from '@/config'
import { branding } from '@/branding'
import { craftyApiBaseOverride, craftyWebUrlOverride } from '@/helpers/crafty-endpoints'
import { craftyJwt } from '@/helpers/crafty-session'
import {
	craftyCpuPercent,
	craftyFormatMemoryGb,
	craftyLifecycle,
	craftyMemPercent,
	craftyParsePlayerLines,
	craftyPlayersSnippet,
	type CraftyLifecycle,
} from '@/helpers/crafty-stats'
import CraftyBackupsTab from '@/components/crafty/CraftyBackupsTab.vue'
import CraftyFilesTab from '@/components/crafty/CraftyFilesTab.vue'
import CraftyMetricsTab from '@/components/crafty/CraftyMetricsTab.vue'
import CraftyPlayersTab from '@/components/crafty/CraftyPlayersTab.vue'
import CraftySchedulesTab from '@/components/crafty/CraftySchedulesTab.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const client = injectModrinthClient()
const queryClient = useQueryClient()

const craftyApiCacheKey = computed(() => {
	const o = craftyApiBaseOverride.value.trim().replace(/\/$/, '')
	return o || config.craftyBaseUrl
})

const craftyWebEffective = computed(() => {
	const w = craftyWebUrlOverride.value.trim().replace(/\/$/, '')
	return w || config.craftyWebUrl
})

const serverId = computed(() => {
	const raw = route.params.id
	return typeof raw === 'string' ? raw : raw?.[0] ?? ''
})

const enabledDetail = computed(() => Boolean(serverId.value && craftyJwt.value))

const activeTab = ref(0)
const craftyJwtKeyForChild = computed(() => craftyJwt.value ?? '')

const tabLinks = computed(() => [
	{ label: t('app.crafty-servers.tab-overview'), href: 'overview' },
	{ label: t('app.crafty-servers.tab-console'), href: 'console' },
	{ label: t('app.crafty-servers.tab-logs'), href: 'logs' },
	{ label: t('app.crafty-servers.tab-players'), href: 'players' },
	{ label: t('app.crafty-servers.tab-files'), href: 'files' },
	{ label: t('app.crafty-servers.tab-backups'), href: 'backups' },
	{ label: t('app.crafty-servers.tab-schedules'), href: 'schedules' },
	{ label: t('app.crafty-servers.tab-metrics'), href: 'metrics' },
	{ label: t('app.crafty-servers.tab-webhooks'), href: 'webhooks' },
])

function onTabClick(index: number) {
	activeTab.value = index
}

const serverQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'server',
		serverId.value,
		craftyJwt.value ?? '',
		craftyApiCacheKey.value,
	]),
	queryFn: async (): Promise<Crafty.Servers.v2.Server> => {
		const res = await client.crafty.v2.getServer(serverId.value)
		if (res.status !== 'ok' || !res.data) {
			throw new Error(res.error ?? res.error_data ?? t('app.crafty-servers.err-load-server'))
		}
		return res.data
	},
	enabled: enabledDetail,
})

const statsQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'server',
		serverId.value,
		'stats',
		craftyJwt.value ?? '',
		craftyApiCacheKey.value,
	]),
	queryFn: async (): Promise<Crafty.v2.ServerStats> => {
		const res = await client.crafty.v2.getStats(serverId.value)
		if (res.status !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? t('app.crafty-servers.err-load-stats'))
		}
		return res.data ?? {}
	},
	enabled: computed(() => enabledDetail.value && activeTab.value === 0),
	refetchInterval: computed(() => (enabledDetail.value && activeTab.value === 0 ? 4000 : false)),
	retry: false,
})

const usersQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'server',
		serverId.value,
		'users',
		craftyJwt.value ?? '',
		craftyApiCacheKey.value,
	]),
	queryFn: async (): Promise<number[]> => {
		const res = await client.crafty.v2.getServerUsers(serverId.value)
		if (res.status !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? t('app.crafty-servers.err-load-users'))
		}
		return res.data ?? []
	},
	enabled: computed(() => enabledDetail.value && activeTab.value === 0),
	retry: false,
})

const webhooksQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'webhooks',
		serverId.value,
		craftyJwt.value ?? '',
		craftyApiCacheKey.value,
	]),
	queryFn: async (): Promise<Crafty.v2.Webhook[]> => {
		const res = await client.crafty.v2.listWebhooks(serverId.value)
		if (res.status !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? t('app.crafty-servers.err-load-webhooks'))
		}
		const raw = res.data ?? {}
		return Object.entries(raw).map(([id, w]) => ({ ...w, _id: Number(id) }))
	},
	enabled: computed(() => enabledDetail.value && activeTab.value === 8),
	retry: false,
})

const logText = ref('')
const logFromFile = ref(false)
const logRaw = ref(true)
const logPaused = ref(false)

async function refreshLogs() {
	if (!enabledDetail.value) return
	const res = await client.crafty.v2.getLogs(serverId.value, {
		file: logFromFile.value,
		raw: logRaw.value,
	})
	if (res.status === 'ok' && res.data?.length) {
		logText.value = res.data.join('\n')
	} else if (res.status === 'ok') {
		logText.value = t('app.crafty-servers.log-empty')
	} else {
		logText.value = res.error ?? res.error_data ?? t('app.crafty-servers.log-load-failed')
	}
}

const { pause: pauseLogPoll, resume: resumeLogPoll } = useIntervalFn(
	() => void refreshLogs(),
	4500,
	{ immediate: false },
)

watch(
	() =>
		enabledDetail.value &&
		activeTab.value === 2 &&
		!logPaused.value,
	(on) => {
		if (on) {
			void refreshLogs()
			resumeLogPoll()
		} else {
			pauseLogPoll()
		}
	},
	{ immediate: true },
)

watch([logFromFile, logRaw], () => {
	if (enabledDetail.value && activeTab.value === 2 && !logPaused.value) {
		void refreshLogs()
	}
})

const consoleTailText = ref('')
const consoleTailPaused = ref(false)
const consoleTailFollow = ref(true)
const consoleTailPre = ref<HTMLPreElement | null>(null)

async function refreshConsoleTail() {
	if (!enabledDetail.value || activeTab.value !== 1) return
	try {
		const res = await client.crafty.v2.getLogs(serverId.value, {
			file: false,
			raw: true,
		})
		if (res.status === 'ok' && res.data?.length) {
			consoleTailText.value = res.data.join('\n')
		} else if (res.status === 'ok') {
			consoleTailText.value = t('app.crafty-servers.log-empty')
		} else {
			consoleTailText.value = res.error ?? res.error_data ?? t('app.crafty-servers.log-load-failed')
		}
		await nextTick()
		const el = consoleTailPre.value
		if (el && consoleTailFollow.value && !consoleTailPaused.value) {
			el.scrollTop = el.scrollHeight
		}
	} catch (e) {
		consoleTailText.value = e instanceof Error ? e.message : String(e)
	}
}

const { pause: pauseConsolePoll, resume: resumeConsolePoll } = useIntervalFn(
	() => void refreshConsoleTail(),
	1500,
	{ immediate: false },
)

watch(
	() =>
		enabledDetail.value &&
		activeTab.value === 1 &&
		Boolean(serverId.value) &&
		!consoleTailPaused.value,
	(on) => {
		if (on) {
			void refreshConsoleTail()
			resumeConsolePoll()
		} else {
			pauseConsolePoll()
		}
	},
	{ immediate: true },
)

watch([enabledDetail, serverId], () => {
	if (enabledDetail.value && activeTab.value === 2 && !logPaused.value) {
		void refreshLogs()
	}
	if (enabledDetail.value && activeTab.value === 1 && !consoleTailPaused.value) {
		void refreshConsoleTail()
	}
})

const powerError = ref<string | null>(null)

async function sendPowerAction(action: Crafty.v2.ServerPowerAction) {
	powerError.value = null
	try {
		const res = await client.crafty.v2.serverAction(serverId.value, action)
		if (res.status !== 'ok') {
			powerError.value = res.error ?? res.error_data ?? t('app.crafty-servers.action-failed')
			return
		}
		if (action === 'clone_server' && 'data' in res && res.data?.new_server_id) {
			await queryClient.invalidateQueries({ queryKey: ['crafty', 'servers'] })
			void router.push(`/hosting/manage/${encodeURIComponent(res.data.new_server_id)}`)
			return
		}
		await queryClient.invalidateQueries({
			queryKey: ['crafty', 'server', serverId.value],
		})
		await queryClient.invalidateQueries({ queryKey: ['crafty', 'servers'] })
		await queryClient.invalidateQueries({
			queryKey: ['crafty', 'server', serverId.value, 'stats'],
		})
		if (activeTab.value === 2 && !logPaused.value) {
			await refreshLogs()
		} else if (activeTab.value === 1 && !consoleTailPaused.value) {
			await refreshConsoleTail()
		}
	} catch (e) {
		powerError.value = e instanceof Error ? e.message : String(e)
	}
}

const stdinCmd = ref('')

async function sendStdin() {
	const cmd = stdinCmd.value.trim()
	if (!cmd) return
	await client.crafty.v2.sendStdin(serverId.value, cmd)
	stdinCmd.value = ''
	if (activeTab.value === 2 && !logPaused.value) {
		await refreshLogs()
	} else if (activeTab.value === 1 && !consoleTailPaused.value) {
		await refreshConsoleTail()
	}
}

function openCrafty() {
	void openUrl(craftyWebEffective.value)
}

function backToList() {
	void router.push('/hosting/manage/')
}

const server = computed(() => serverQuery.data.value)
const serverTitle = computed(() => server.value?.server_name ?? serverId.value)

const renameDraft = ref('')
watch(
	() => server.value?.server_name,
	(name) => {
		if (typeof name === 'string') renameDraft.value = name
	},
	{ immediate: true },
)

const renameBusy = ref(false)
const renameError = ref<string | null>(null)

async function saveRename() {
	renameError.value = null
	const name = renameDraft.value.trim()
	if (!name || name === server.value?.server_name) return
	renameBusy.value = true
	try {
		const res = await client.crafty.v2.patchServer(serverId.value, { server_name: name })
		if (res.status !== 'ok') {
			renameError.value = res.error ?? res.error_data ?? t('app.crafty-servers.err-rename-server')
			return
		}
		await queryClient.invalidateQueries({
			queryKey: ['crafty', 'server', serverId.value],
		})
		await queryClient.invalidateQueries({ queryKey: ['crafty', 'servers'] })
	} finally {
		renameBusy.value = false
	}
}

function statStr(key: string): string | undefined {
	const s = statsQuery.data.value?.[key]
	if (s === undefined || s === null) return undefined
	if (typeof s === 'string' || typeof s === 'number' || typeof s === 'boolean') {
		return String(s)
	}
	return undefined
}

const playerLines = computed(() => craftyParsePlayerLines(statsQuery.data.value?.players))

const statsRow = computed(() => [
	{ label: t('app.crafty-servers.stat-running'), value: statStr('running') },
	{ label: t('app.crafty-servers.stat-cpu'), value: statStr('cpu') },
	{
		label: t('app.crafty-servers.stat-mem'),
		value:
			craftyFormatMemoryGb(statsQuery.data.value ?? undefined) ??
			statStr('mem'),
	},
	{ label: t('app.crafty-servers.stat-mem-percent'), value: statStr('mem_percent') },
	{
		label: t('app.crafty-servers.stat-players'),
		value: statStr('online')
			? `${statStr('online')} / ${statStr('max') ?? '?'}`
			: undefined,
	},
	{ label: t('app.crafty-servers.stat-version'), value: statStr('version') },
	{ label: t('app.crafty-servers.stat-world'), value: statStr('world_name') },
	{ label: t('app.crafty-servers.stat-world-size'), value: statStr('world_size') },
	{ label: t('app.crafty-servers.stat-started'), value: statStr('started') },
])

const overviewStatsBag = computed(() => (statsQuery.data.value ?? {}) as Record<string, unknown>)
const overviewMemGbDisplay = computed(() => craftyFormatMemoryGb(overviewStatsBag.value))
const overviewLifecycle = computed(() => craftyLifecycle(overviewStatsBag.value))

function overviewLcLabel(lc: CraftyLifecycle): string {
	switch (lc) {
		case 'online':
			return t('app.crafty-servers.status-online')
		case 'offline':
			return t('app.crafty-servers.status-offline')
		case 'crashed':
			return t('app.crafty-servers.status-crashed')
		default:
			return t('app.crafty-servers.status-unknown')
	}
}

function overviewPillClass(lc: CraftyLifecycle): string {
	switch (lc) {
		case 'online':
			return 'bg-green/15 text-green'
		case 'crashed':
			return 'bg-red/15 text-red'
		case 'offline':
			return 'bg-secondary-bg text-secondary'
		default:
			return 'bg-orange/15 text-orange'
	}
}

const configRows = computed(() => {
	const s = server.value
	if (!s) return []
	const keys: { key: keyof Crafty.Servers.v2.Server | string; mid: string }[] = [
		{ key: 'type', mid: 'app.crafty-servers.cfg-type' },
		{ key: 'path', mid: 'app.crafty-servers.cfg-path' },
		{ key: 'backup_path', mid: 'app.crafty-servers.cfg-backup-path' },
		{ key: 'executable', mid: 'app.crafty-servers.cfg-executable' },
		{ key: 'execution_command', mid: 'app.crafty-servers.cfg-execution-command' },
		{ key: 'log_path', mid: 'app.crafty-servers.cfg-log-path' },
		{ key: 'stop_command', mid: 'app.crafty-servers.cfg-stop-command' },
		{ key: 'auto_start', mid: 'app.crafty-servers.cfg-auto-start' },
		{ key: 'auto_start_delay', mid: 'app.crafty-servers.cfg-auto-start-delay' },
		{ key: 'crash_detection', mid: 'app.crafty-servers.cfg-crash-detection' },
		{ key: 'logs_delete_after', mid: 'app.crafty-servers.cfg-logs-delete-after' },
		{ key: 'executable_update_url', mid: 'app.crafty-servers.cfg-executable-update-url' },
	]
	return keys
		.map(({ key, mid }) => {
			const v = s[key as keyof typeof s]
			if (v === undefined || v === null || v === '') return null
			return {
				label: t(mid),
				value: typeof v === 'boolean' ? (v ? t('app.crafty-servers.bool-yes') : t('app.crafty-servers.bool-no')) : String(v),
			}
		})
		.filter(Boolean) as { label: string; value: string }[]
})

const cloneConfirm = ref<InstanceType<typeof ConfirmModal> | null>(null)
const updateExeConfirm = ref<InstanceType<typeof ConfirmModal> | null>(null)
const deleteServerConfirm = ref<InstanceType<typeof ConfirmModal> | null>(null)

const newWebhook = ref({
	name: '',
	url: '',
	webhook_type: 'Discord',
	trigger: 'server_start',
	body: '',
	enabled: true,
})
const webhookBusy = ref(false)
const webhookError = ref<string | null>(null)

async function submitWebhook() {
	webhookError.value = null
	const name = newWebhook.value.name.trim()
	const url = newWebhook.value.url.trim()
	if (!name || !url) {
		webhookError.value = t('app.crafty-servers.webhook-name-url-required')
		return
	}
	const triggers = newWebhook.value.trigger
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean)
	if (!triggers.length) triggers.push('server_start')

	webhookBusy.value = true
	try {
		const res = await client.crafty.v2.createWebhook(serverId.value, {
			webhook_type: newWebhook.value.webhook_type.trim() || 'Discord',
			name,
			url,
			body: newWebhook.value.body.trim() || undefined,
			enabled: newWebhook.value.enabled,
			trigger: triggers,
		})
		if (res.status !== 'ok') {
			webhookError.value = res.error ?? res.error_data ?? t('app.crafty-servers.err-create-webhook')
			return
		}
		newWebhook.value = {
			name: '',
			url: '',
			webhook_type: 'Discord',
			trigger: 'server_start',
			body: '',
			enabled: true,
		}
		await queryClient.invalidateQueries({
			queryKey: ['crafty', 'webhooks', serverId.value],
		})
	} finally {
		webhookBusy.value = false
	}
}

async function toggleWebhook(id: number, enabled: boolean) {
	webhookError.value = null
	try {
		await client.crafty.v2.patchWebhook(serverId.value, id, { enabled: !enabled })
		await queryClient.invalidateQueries({
			queryKey: ['crafty', 'webhooks', serverId.value],
		})
	} catch (e) {
		webhookError.value = e instanceof Error ? e.message : String(e)
	}
}

const pendingWebhookDeleteId = ref<number | null>(null)
const deleteWebhookConfirm = ref<InstanceType<typeof ConfirmModal> | null>(null)

function askDeleteWebhook(id: number) {
	pendingWebhookDeleteId.value = id
	deleteWebhookConfirm.value?.show()
}

async function confirmDeleteWebhook() {
	const id = pendingWebhookDeleteId.value
	pendingWebhookDeleteId.value = null
	if (id == null) return
	await client.crafty.v2.deleteWebhook(serverId.value, id)
	await queryClient.invalidateQueries({
		queryKey: ['crafty', 'webhooks', serverId.value],
	})
}

async function confirmDeleteServer() {
	const res = await client.crafty.v2.deleteServer(serverId.value)
	if (res.status !== 'ok') {
		powerError.value = res.error ?? res.error_data ?? t('app.crafty-servers.err-delete-server')
		return
	}
	await queryClient.invalidateQueries({ queryKey: ['crafty'] })
	void router.push('/hosting/manage/')
}
</script>

<template>
	<div class="experimental-styles-within mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 pb-16">
		<div class="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-solid border-divider pb-4">
			<div class="flex flex-col gap-1">
				<ButtonStyled type="transparent">
					<button type="button" class="!justify-start text-secondary hover:text-primary" @click="backToList">
						{{ t('app.crafty-servers.back-list') }}
					</button>
				</ButtonStyled>
				<h1 class="m-0 text-2xl font-extrabold text-contrast">{{ serverTitle }}</h1>
				<p v-if="server?.server_ip && server?.server_port" class="m-0 font-mono text-sm text-secondary">
					{{ server.server_ip }}:{{ server.server_port }}
				</p>
				<div
					v-if="!statsQuery.isPending.value && !statsQuery.isError.value && craftyJwt"
					class="m-0 mt-2 flex flex-wrap items-center gap-2"
				>
					<span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="overviewPillClass(overviewLifecycle)">
						{{ overviewLcLabel(overviewLifecycle) }}
					</span>
					<span v-if="craftyPlayersSnippet(overviewStatsBag)" class="text-sm text-secondary">
						{{ t('app.crafty-servers.players-short') }} {{ craftyPlayersSnippet(overviewStatsBag) }}
					</span>
				</div>
			</div>
			<ButtonStyled type="standard">
				<button type="button" @click="openCrafty">{{ t('app.crafty-servers.open-panel') }}</button>
			</ButtonStyled>
		</div>

		<div v-if="!craftyJwt" class="rounded-2xl border border-orange bg-bg-orange p-4 text-primary">
			{{ t('app.crafty-servers.signed-out-detail') }}
		</div>

		<div v-else-if="serverQuery.isPending.value" class="animate-pulse text-secondary">
			{{ t('app.crafty-servers.loading-server') }}
		</div>

		<div v-else-if="serverQuery.isError.value" class="rounded-2xl border border-red bg-bg-red p-4 text-primary">
			{{
				serverQuery.error.value instanceof Error
					? serverQuery.error.value.message
					: String(serverQuery.error.value ?? '')
			}}
		</div>

		<template v-else-if="server">
			<NavTabs mode="local" :links="tabLinks" :active-index="activeTab" @tab-click="onTabClick" />

			<p v-if="powerError" class="m-0 rounded-xl border border-red bg-bg-red px-3 py-2 text-sm text-primary">
				{{ powerError }}
			</p>

			<!-- Overview -->
			<div v-if="activeTab === 0" class="flex flex-col gap-6">
				<p class="m-0 max-w-3xl text-sm text-secondary">
					{{ t('app.crafty-servers.detail-advanced-hint') }}
					<button type="button" class="text-brand underline hover:brightness-110" @click="openCrafty">
						{{ craftyWebEffective }}
					</button>
				</p>
				<div class="rounded-2xl border border-divider bg-bg-raised p-4">
					<h2 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
						{{ t('app.crafty-servers.detail-primary-actions') }}
					</h2>
					<div class="mt-3 flex flex-wrap gap-2">
						<ButtonStyled color="brand">
							<button type="button" @click="sendPowerAction('start_server')">
								{{ t('app.crafty-servers.act-start') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button type="button" @click="sendPowerAction('stop_server')">
								{{ t('app.crafty-servers.act-stop') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button type="button" @click="sendPowerAction('restart_server')">
								{{ t('app.crafty-servers.act-restart') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button type="button" @click="sendPowerAction('backup_server')">
								{{ t('app.crafty-servers.act-backup') }}
							</button>
						</ButtonStyled>
					</div>
				</div>
				<div class="rounded-2xl border border-divider bg-bg-raised p-4">
					<h2 class="m-0 text-xs font-bold uppercase tracking-wide text-secondary">
						{{ t('app.crafty-servers.detail-extra-actions') }}
					</h2>
					<div class="mt-3 flex flex-wrap gap-2">
						<ButtonStyled color="red" type="standard">
							<button type="button" @click="sendPowerAction('kill_server')">
								{{ t('app.crafty-servers.act-kill') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button type="button" @click="cloneConfirm?.show()">
								{{ t('app.crafty-servers.act-clone') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button type="button" @click="updateExeConfirm?.show()">
								{{ t('app.crafty-servers.act-update-exe') }}
							</button>
						</ButtonStyled>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.live-status') }}</h2>
					<div
						v-if="
							!statsQuery.isError.value &&
							(craftyCpuPercent(overviewStatsBag) != null ||
								craftyMemPercent(overviewStatsBag) != null ||
								overviewMemGbDisplay)
						"
						class="grid gap-4 sm:grid-cols-2"
					>
						<div v-if="craftyCpuPercent(overviewStatsBag) != null" class="rounded-2xl border border-divider bg-bg-raised p-4">
							<p class="m-0 text-xs font-bold uppercase text-secondary">{{ t('app.crafty-servers.cpu-short') }}</p>
							<p class="m-0 mt-1 text-2xl font-bold text-contrast">{{ craftyCpuPercent(overviewStatsBag) }}%</p>
							<div class="mt-2 h-3 overflow-hidden rounded-full bg-secondary-bg">
								<div
									class="h-full rounded-full bg-green"
									:style="{ width: `${Math.min(100, craftyCpuPercent(overviewStatsBag) ?? 0)}%` }"
								/>
							</div>
						</div>
						<div
							v-if="craftyMemPercent(overviewStatsBag) != null || overviewMemGbDisplay"
							class="rounded-2xl border border-divider bg-bg-raised p-4"
						>
							<p class="m-0 text-xs font-bold uppercase text-secondary">{{ t('app.crafty-servers.mem-short') }}</p>
							<p
								v-if="craftyMemPercent(overviewStatsBag) != null"
								class="m-0 mt-1 text-2xl font-bold text-contrast"
							>
								{{ craftyMemPercent(overviewStatsBag) }}%
							</p>
							<div
								v-if="craftyMemPercent(overviewStatsBag) != null"
								class="mt-2 h-3 overflow-hidden rounded-full bg-secondary-bg"
							>
								<div
									class="h-full rounded-full bg-brand"
									:style="{ width: `${Math.min(100, craftyMemPercent(overviewStatsBag) ?? 0)}%` }"
								/>
							</div>
							<p
								v-if="overviewMemGbDisplay"
								class="m-0 font-mono text-sm text-secondary"
								:class="
									craftyMemPercent(overviewStatsBag) != null ? 'mt-3' : 'mt-1 text-xl font-semibold text-contrast'
								"
							>
								{{ overviewMemGbDisplay }}
							</p>
						</div>
					</div>
					<p v-if="statsQuery.isPending.value" class="m-0 text-sm text-secondary">
						{{ t('app.crafty-servers.loading-stats') }}
					</p>
					<p v-else-if="statsQuery.isError.value" class="m-0 text-sm text-orange">
						{{
							statsQuery.error.value instanceof Error
								? statsQuery.error.value.message
								: String(statsQuery.error.value ?? '')
						}}
						<span class="text-secondary">{{ t('app.crafty-servers.stats-access-hint') }}</span>
					</p>
					<div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<div
							v-for="cell in statsRow"
							:key="cell.label"
							class="rounded-2xl border border-divider bg-bg-raised px-4 py-3"
						>
							<p class="m-0 text-xs font-semibold uppercase tracking-wide text-secondary">{{ cell.label }}</p>
							<p class="m-0 mt-1 font-mono text-sm text-contrast">
								{{ cell.value ?? t('app.crafty-servers.dash-placeholder') }}
							</p>
						</div>
					</div>
				</div>

				<div v-if="playerLines.length" class="flex flex-col gap-2">
					<h3 class="m-0 text-base font-semibold text-contrast">{{ t('app.crafty-servers.online-players') }}</h3>
					<ul class="m-0 list-disc pl-5 text-sm text-primary">
						<li v-for="p in playerLines" :key="p">{{ p }}</li>
					</ul>
				</div>

				<div class="flex flex-col gap-2">
					<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.detail-display-name') }}</h2>
					<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.rename-hint') }}</p>
					<div class="flex flex-wrap items-end gap-2">
						<StyledInput v-model="renameDraft" wrapper-class="max-w-md flex-1" />
						<ButtonStyled color="brand" type="standard">
							<button type="button" :disabled="renameBusy" @click="saveRename">
								{{ t('app.crafty-servers.save-name') }}
							</button>
						</ButtonStyled>
					</div>
					<p v-if="renameError" class="m-0 text-sm text-orange">{{ renameError }}</p>
				</div>

				<div class="flex flex-col gap-2">
					<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.detail-config') }}</h2>
					<div class="flex flex-col gap-0 rounded-2xl border border-divider bg-bg-raised p-4">
						<div
							v-for="row in configRows"
							:key="row.label"
							class="flex flex-col gap-1 border-0 border-b border-solid border-divider py-3 last:border-b-0 sm:flex-row sm:gap-6"
						>
							<span class="m-0 shrink-0 text-xs font-bold uppercase text-secondary sm:w-52">{{ row.label }}</span>
							<span class="m-0 font-mono text-sm text-primary break-all">{{ row.value }}</span>
						</div>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.detail-access') }}</h2>
					<p v-if="usersQuery.isPending.value" class="m-0 text-sm text-secondary">
						{{ t('app.crafty-servers.users-loading') }}
					</p>
					<p v-else-if="usersQuery.isError.value" class="m-0 text-sm text-secondary">
						{{ t('app.crafty-servers.users-error') }}
					</p>
					<p v-else class="m-0 font-mono text-sm text-primary">
						{{ usersQuery.data.value?.join(', ') || t('app.crafty-servers.dash-placeholder') }}
					</p>
				</div>

				<div class="flex flex-col gap-2">
					<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.danger-zone') }}</h2>
					<p class="m-0 mt-1 text-sm text-secondary">{{ t('app.crafty-servers.danger-zone-body') }}</p>
					<ButtonStyled class="mt-3" color="red" type="standard">
						<button type="button" @click="deleteServerConfirm?.show()">
							{{ t('app.crafty-servers.act-delete-server') }}
						</button>
					</ButtonStyled>
				</div>
			</div>

			<!-- Console -->
			<div v-else-if="activeTab === 1" class="flex flex-col gap-3">
				<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.console-title') }}</h2>
				<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.console-live-hint') }}</p>
				<div class="flex flex-wrap items-center gap-4">
					<label class="flex cursor-pointer items-center gap-2 text-sm text-primary">
						<input v-model="consoleTailPaused" type="checkbox" class="rounded border-divider" />
						{{ t('app.crafty-servers.console-pause-tail') }}
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm text-primary">
						<input v-model="consoleTailFollow" type="checkbox" class="rounded border-divider" />
						{{ t('app.crafty-servers.console-auto-scroll') }}
					</label>
					<ButtonStyled type="standard">
						<button type="button" @click="refreshConsoleTail">{{ t('app.crafty-servers.log-refresh') }}</button>
					</ButtonStyled>
				</div>
				<pre
					ref="consoleTailPre"
					class="max-h-[340px] min-h-[200px] overflow-auto whitespace-pre-wrap rounded-2xl border border-divider bg-surface-2 p-4 font-mono text-xs leading-relaxed text-primary"
				>{{ consoleTailText }}</pre>
				<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.console-hint') }}</p>
				<div class="flex flex-wrap gap-2">
					<input
						v-model="stdinCmd"
						class="min-w-[240px] flex-1 rounded-xl border border-divider bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-brand"
						type="text"
						:placeholder="t('app.crafty-servers.console-ph', { product: branding.productNameShort })"
						@keydown.enter="sendStdin"
					/>
					<ButtonStyled color="brand">
						<button type="button" @click="sendStdin">{{ t('app.crafty-servers.send') }}</button>
					</ButtonStyled>
				</div>
			</div>

			<!-- Logs -->
			<div v-else-if="activeTab === 2" class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center gap-4">
					<label class="flex cursor-pointer items-center gap-2 text-sm text-primary">
						<input v-model="logFromFile" type="checkbox" class="rounded border-divider" />
						{{ t('app.crafty-servers.log-from-file') }}
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm text-primary">
						<input v-model="logRaw" type="checkbox" class="rounded border-divider" />
						{{ t('app.crafty-servers.log-raw') }}
					</label>
					<label class="flex cursor-pointer items-center gap-2 text-sm text-primary">
						<input v-model="logPaused" type="checkbox" class="rounded border-divider" />
						{{ t('app.crafty-servers.log-pause') }}
					</label>
					<ButtonStyled type="standard">
						<button type="button" @click="refreshLogs">{{ t('app.crafty-servers.log-refresh') }}</button>
					</ButtonStyled>
				</div>
				<pre
					class="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-divider bg-surface-2 p-4 font-mono text-xs leading-relaxed text-primary"
				>{{ logText }}</pre>
			</div>

			<!-- Players -->
			<div v-else-if="activeTab === 3">
				<CraftyPlayersTab
					:server-id="serverId"
					:crafty-api-cache-key="craftyApiCacheKey"
					:crafty-jwt-key="craftyJwtKeyForChild"
				/>
			</div>

			<!-- Files -->
			<div v-else-if="activeTab === 4">
				<CraftyFilesTab
					:server-id="serverId"
					:crafty-api-cache-key="craftyApiCacheKey"
					:crafty-jwt-key="craftyJwtKeyForChild"
				/>
			</div>

			<!-- Backups -->
			<div v-else-if="activeTab === 5">
				<CraftyBackupsTab
					:server-id="serverId"
					:crafty-api-cache-key="craftyApiCacheKey"
					:crafty-jwt-key="craftyJwtKeyForChild"
				/>
			</div>

			<!-- Schedules -->
			<div v-else-if="activeTab === 6">
				<CraftySchedulesTab
					:server-id="serverId"
					:crafty-api-cache-key="craftyApiCacheKey"
					:crafty-jwt-key="craftyJwtKeyForChild"
				/>
			</div>

			<!-- Metrics -->
			<div v-else-if="activeTab === 7">
				<CraftyMetricsTab
					:server-id="serverId"
					:crafty-api-cache-key="craftyApiCacheKey"
					:crafty-jwt-key="craftyJwtKeyForChild"
				/>
			</div>

			<!-- Webhooks -->
			<div v-else-if="activeTab === 8" class="flex flex-col gap-6">
				<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.webhooks-intro') }}</p>

				<p v-if="webhookError" class="m-0 rounded-xl border border-orange bg-bg-orange px-3 py-2 text-sm text-primary">
					{{ webhookError }}
				</p>

				<div v-if="webhooksQuery.isPending.value" class="text-secondary">
					{{ t('app.crafty-servers.loading-webhooks') }}
				</div>
				<div v-else-if="webhooksQuery.isError.value" class="text-orange">
					{{
						webhooksQuery.error.value instanceof Error
							? webhooksQuery.error.value.message
							: String(webhooksQuery.error.value ?? '')
					}}
				</div>
				<ul v-else class="m-0 flex list-none flex-col gap-3 p-0">
					<li
						v-for="hook in webhooksQuery.data.value ?? []"
						:key="hook._id"
						class="rounded-2xl border border-divider bg-bg-raised p-4"
					>
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<p class="m-0 font-semibold text-contrast">
									{{ hook.name ?? t('app.crafty-servers.webhook-fallback', { id: hook._id }) }}
								</p>
								<p class="m-0 mt-1 break-all font-mono text-xs text-secondary">{{ hook.url }}</p>
								<p class="m-0 mt-1 text-xs text-secondary">
									{{
										t('app.crafty-servers.webhook-type-trigger', {
											type: hook.webhook_type ?? t('app.crafty-servers.dash-placeholder'),
											trigger: hook.trigger ?? t('app.crafty-servers.dash-placeholder'),
										})
									}}
								</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<label class="flex cursor-pointer items-center gap-2 text-sm">
									<input
										type="checkbox"
										class="rounded border-divider"
										:checked="hook.enabled !== false"
										@change="
											toggleWebhook(hook._id, hook.enabled !== false)
										"
									/>
									{{ t('app.crafty-servers.enabled') }}
								</label>
								<ButtonStyled color="red" type="transparent">
									<button type="button" @click="askDeleteWebhook(hook._id)">
										{{ t('app.crafty-servers.webhook-remove') }}
									</button>
								</ButtonStyled>
							</div>
						</div>
					</li>
				</ul>

				<div class="rounded-2xl border border-divider bg-bg-raised p-4">
					<h3 class="m-0 text-base font-semibold text-contrast">{{ t('app.crafty-servers.new-webhook') }}</h3>
					<div class="mt-3 grid gap-3 sm:grid-cols-2">
						<StyledInput v-model="newWebhook.name" :placeholder="t('app.crafty-servers.webhook-ph-name')" />
						<StyledInput
							v-model="newWebhook.webhook_type"
							:placeholder="t('app.crafty-servers.webhook-ph-type')"
						/>
						<StyledInput
							v-model="newWebhook.url"
							:placeholder="t('app.crafty-servers.webhook-ph-url')"
							wrapper-class="sm:col-span-2"
						/>
						<StyledInput
							v-model="newWebhook.trigger"
							:placeholder="t('app.crafty-servers.webhook-ph-triggers')"
						/>
						<label class="flex items-center gap-2 text-sm">
							<input v-model="newWebhook.enabled" type="checkbox" class="rounded border-divider" />
							{{ t('app.crafty-servers.enabled') }}
						</label>
						<StyledInput
							v-model="newWebhook.body"
							:placeholder="t('app.crafty-servers.webhook-ph-body')"
							wrapper-class="sm:col-span-2"
						/>
					</div>
					<ButtonStyled class="mt-3" color="brand">
						<button type="button" :disabled="webhookBusy" @click="submitWebhook">
							{{ t('app.crafty-servers.create-webhook') }}
						</button>
					</ButtonStyled>
				</div>
			</div>

			<ConfirmModal
				ref="cloneConfirm"
				:title="t('app.crafty-servers.clone-title')"
				:markdown="false"
				:description="t('app.crafty-servers.clone-desc')"
				:proceed-label="t('app.crafty-servers.clone-proceed')"
				@proceed="sendPowerAction('clone_server')"
			/>
			<ConfirmModal
				ref="updateExeConfirm"
				:title="t('app.crafty-servers.update-exe-title')"
				:markdown="false"
				:description="t('app.crafty-servers.update-exe-desc')"
				:proceed-label="t('app.crafty-servers.update-proceed')"
				@proceed="sendPowerAction('update_executable')"
			/>
			<ConfirmModal
				ref="deleteServerConfirm"
				:danger="true"
				:title="t('app.crafty-servers.delete-server-title')"
				:markdown="false"
				:has-to-type="true"
				:confirmation-text="serverTitle"
				:description="t('app.crafty-servers.delete-server-desc')"
				:proceed-label="t('app.crafty-servers.delete-server-proceed')"
				@proceed="confirmDeleteServer"
			/>
			<ConfirmModal
				ref="deleteWebhookConfirm"
				:danger="true"
				:title="t('app.crafty-servers.remove-webhook-title')"
				:markdown="false"
				:description="t('app.crafty-servers.remove-webhook-desc')"
				:proceed-label="t('app.crafty-servers.remove-webhook-proceed')"
				@proceed="confirmDeleteWebhook"
			/>
		</template>
	</div>
</template>
