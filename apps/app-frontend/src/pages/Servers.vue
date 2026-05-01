<script setup lang="ts">
import type { Crafty } from '@modrinth/api-client'
import { LogInIcon, PlusIcon, ServerStackIcon } from '@modrinth/assets'
import { ButtonStyled, ConfirmModal, ServerListEmpty, StyledInput } from '@modrinth/ui'
import { injectModrinthClient } from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { branding } from '@/branding'
import { config } from '@/config'
import { craftyApiBaseOverride, craftyWebUrlOverride } from '@/helpers/crafty-endpoints'
import {
	craftyCpuPercent,
	craftyLifecycle,
	craftyMemPercent,
	craftyPlayersSnippet,
	craftyIconDataUrl,
	statStr,
	type CraftyLifecycle,
	type CraftyStats,
} from '@/helpers/crafty-stats'
import { craftyJwt, setCraftyJwt } from '@/helpers/crafty-session'

const { t } = useI18n()
const client = injectModrinthClient()
const router = useRouter()
const queryClient = useQueryClient()

const craftyApiCacheKey = computed(() => {
	const o = craftyApiBaseOverride.value.trim().replace(/\/$/, '')
	return o || config.craftyBaseUrl
})

const craftyWebEffective = computed(() => {
	const w = craftyWebUrlOverride.value.trim().replace(/\/$/, '')
	return w || config.craftyWebUrl
})

const username = ref('')
const password = ref('')
const mfaMethod = ref<'none' | 'totp' | 'backup'>('none')
const totpCode = ref('')
const backupCode = ref('')
const loginError = ref<string | null>(null)

const loggedIn = computed(() => Boolean(craftyJwt.value))

const serversQuery = useQuery({
	queryKey: computed(() => ['crafty', 'servers', craftyJwt.value ?? '', craftyApiCacheKey.value]),
	queryFn: async (): Promise<Crafty.Servers.v2.Server[]> => {
		const res = await client.crafty.v2.listServers()
		if (res.status !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? 'Could not load servers')
		}
		return res.data ?? []
	},
	enabled: loggedIn,
	retry: 1,
})

const searchRaw = ref('')

function serverStableId(s: Crafty.Servers.v2.Server): string {
	return s.server_id ?? s.server_uuid ?? ''
}

const filteredServers = computed(() => {
	const q = searchRaw.value.trim().toLowerCase()
	const list = serversQuery.data.value ?? []
	if (!q) return list
	return list.filter((s) => {
		const id = serverStableId(s).toLowerCase()
		const name = (s.server_name ?? '').toLowerCase()
		const addr = s.server_ip != null && s.server_port != null ? `${s.server_ip}:${s.server_port}` : ''
		return id.includes(q) || name.includes(q) || addr.toLowerCase().includes(q) || (s.type ?? '').toLowerCase().includes(q)
	})
})

const serverIdListStable = computed(() =>
	[...filteredServers.value.map(serverStableId).filter(Boolean)].sort().join('|'),
)

const statsMapQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'servers-stats-batch',
		craftyJwt.value ?? '',
		craftyApiCacheKey.value,
		serverIdListStable.value,
	]),
	queryFn: async (): Promise<Record<string, CraftyStats>> => {
		const ids = [...filteredServers.value.map(serverStableId).filter(Boolean)]
		const pairs = await Promise.all(
			ids.map(async (id) => {
				try {
					const r = await client.crafty.v2.getStats(id)
					return [id, r.status === 'ok' ? (r.data ?? {}) : {}] as const
				} catch {
					return [id, {}] as const
				}
			}),
		)
		return Object.fromEntries(pairs)
	},
	enabled: computed(
		() => loggedIn.value && filteredServers.value.length > 0 && !serversQuery.isPending.value && !serversQuery.isError.value,
	),
	staleTime: 6000,
	refetchInterval: 14000,
	retry: false,
})

function statFor(id: string): CraftyStats | undefined {
	return statsMapQuery.data.value?.[id]
}

const summary = computed(() => {
	let online = 0
	let crashed = 0
	let offline = 0
	let players = 0
	for (const s of filteredServers.value) {
		const id = serverStableId(s)
		const lc = craftyLifecycle(statFor(id))
		if (lc === 'online') online++
		else if (lc === 'crashed') crashed++
		else if (lc === 'offline') offline++
		const o = Number(statStr(statFor(id), 'online'))
		const n = Number.isFinite(o) ? o : NaN
		if (!Number.isNaN(n)) players += n
	}
	return {
		total: filteredServers.value.length,
		online,
		crashed,
		offline,
		players,
		statsFailed: statsMapQuery.isError.value,
	}
})

function pillClasses(lc: CraftyLifecycle): string {
	switch (lc) {
		case 'online':
			return 'bg-blue/15 text-blue'
		case 'crashed':
			return 'bg-red/15 text-red'
		case 'offline':
			return 'bg-secondary-bg text-secondary'
		default:
			return 'bg-orange/15 text-orange'
	}
}

function lifecycleLabel(lc: CraftyLifecycle): string {
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

async function submitLogin() {
	loginError.value = null
	try {
		const body: Crafty.Auth.v2.LoginBody = {
			username: username.value,
			password: password.value,
		}
		if (mfaMethod.value === 'totp') {
			const digits = totpCode.value.replace(/\D/g, '').slice(0, 6)
			if (digits.length === 6) body.totp = digits
		} else if (mfaMethod.value === 'backup') {
			const bc = backupCode.value.trim()
			if (bc) body.backup_code = bc
		}

		const res = await client.crafty.v2.login(body)
		if (res.status !== 'ok' || !res.data?.token) {
			loginError.value = res.error ?? res.error_data ?? 'Login failed'
			return
		}
		setCraftyJwt(res.data.token)
		password.value = ''
		totpCode.value = ''
		backupCode.value = ''
		mfaMethod.value = 'none'
		await queryClient.invalidateQueries({ queryKey: ['crafty'] })
	} catch (e) {
		loginError.value = e instanceof Error ? e.message : String(e)
	}
}

function signOutCrafty() {
	setCraftyJwt(null)
	queryClient.removeQueries({ queryKey: ['crafty'] })
}

function openCraftyPanel() {
	void openUrl(craftyWebEffective.value)
}

const servers = computed(() => serversQuery.data.value ?? [])
const showEmptyMarketing = computed(
	() =>
		loggedIn.value &&
		!serversQuery.isPending.value &&
		!serversQuery.isError.value &&
		servers.value.length === 0,
)

function rowTitle(s: Crafty.Servers.v2.Server): string {
	return (s.server_name ?? serverStableId(s)).trim() || 'Server'
}

function rowAddress(s: Crafty.Servers.v2.Server): string | null {
	if (s.server_ip != null && s.server_port != null) return `${s.server_ip}:${s.server_port}`
	return null
}

function goToServer(id: string) {
	if (!id) return
	void router.push(`/hosting/manage/${encodeURIComponent(id)}`)
}

const powerListError = ref<string | null>(null)

const powerBusy = ref<string | null>(null)
async function rowPower(serverIdForRow: string, action: Crafty.v2.ServerPowerAction) {
	if (!serverIdForRow) return
	powerBusy.value = serverIdForRow
	powerListError.value = null
	try {
		const res = await client.crafty.v2.serverAction(serverIdForRow, action)
		if (res.status !== 'ok') throw new Error(res.error ?? res.error_data ?? 'Power action failed')
		await queryClient.invalidateQueries({ queryKey: ['crafty'] })
	} catch (e) {
		powerListError.value = e instanceof Error ? e.message : String(e)
	} finally {
		powerBusy.value = null
	}
}

const killModal = ref<InstanceType<typeof ConfirmModal> | null>(null)
const killTargetId = ref<string | null>(null)

function askKill(id: string) {
	killTargetId.value = id
	killModal.value?.show()
}

async function confirmKill() {
	const id = killTargetId.value
	if (!id) return
	await rowPower(id, 'kill_server')
	killTargetId.value = null
}

function rowIconUrl(s: Crafty.Servers.v2.Server): string | null {
	return craftyIconDataUrl(statFor(serverStableId(s))?.['icon'])
}

</script>

<template>
	<div class="experimental-styles-within mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
		<div class="flex flex-col gap-2 border-0 border-b border-solid border-divider pb-4">
			<h1 class="m-0 text-2xl font-extrabold text-contrast">
				{{ t('app.crafty-servers.page-title', { product: branding.productNameShort }) }}
			</h1>
			<p class="m-0 text-secondary">
				<span>{{ t('app.crafty-servers.powered-by') }}</span>
				<button type="button" class="text-brand underline hover:brightness-110" @click="openCraftyPanel">
					{{ craftyWebEffective }}
				</button>
			</p>
		</div>

		<!-- Login -->
		<div
			v-if="!loggedIn"
			class="flex flex-col gap-4 rounded-3xl border border-solid border-divider bg-bg-raised p-6 shadow-xl"
		>
			<h2 class="m-0 text-lg font-semibold text-contrast">{{ t('app.crafty-servers.sign-in-title') }}</h2>
			<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.sign-in-blurb') }}</p>
			<p class="m-0 text-xs text-secondary">{{ t('app.crafty-servers.mfa-blurb') }}</p>
			<div class="flex flex-col gap-2">
				<label class="text-sm font-medium text-secondary" for="crafty-user">{{
					t('app.crafty-servers.username')
				}}</label>
				<input
					id="crafty-user"
					v-model="username"
					autocomplete="username"
					class="rounded-xl border border-divider bg-bg px-3 py-2 text-primary outline-none focus:border-brand"
					type="text"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label class="text-sm font-medium text-secondary" for="crafty-pass">{{
					t('app.crafty-servers.password')
				}}</label>
				<input
					id="crafty-pass"
					v-model="password"
					autocomplete="current-password"
					class="rounded-xl border border-divider bg-bg px-3 py-2 text-primary outline-none focus:border-brand"
					type="password"
					@keydown.enter="submitLogin"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label class="text-sm font-medium text-secondary" for="crafty-mfa-method">{{
					t('app.crafty-servers.mfa-label')
				}}</label>
				<select
					id="crafty-mfa-method"
					v-model="mfaMethod"
					class="rounded-xl border border-divider bg-bg px-3 py-2 text-primary outline-none focus:border-brand"
				>
					<option value="none">{{ t('app.crafty-servers.mfa-none') }}</option>
					<option value="totp">{{ t('app.crafty-servers.mfa-totp') }}</option>
					<option value="backup">{{ t('app.crafty-servers.mfa-backup') }}</option>
				</select>
			</div>
			<div v-if="mfaMethod === 'totp'" class="flex flex-col gap-2">
				<label class="text-sm font-medium text-secondary" for="crafty-totp">{{ t('app.crafty-servers.totp') }}</label>
				<input
					id="crafty-totp"
					v-model="totpCode"
					autocomplete="one-time-code"
					class="rounded-xl border border-divider bg-bg px-3 py-2 font-mono text-primary outline-none focus:border-brand"
					inputmode="numeric"
					maxlength="10"
					pattern="[0-9]*"
					placeholder="000000"
					type="text"
					@keydown.enter="submitLogin"
				/>
			</div>
			<div v-else-if="mfaMethod === 'backup'" class="flex flex-col gap-2">
				<label class="text-sm font-medium text-secondary" for="crafty-backup">{{
					t('app.crafty-servers.backup-code')
				}}</label>
				<input
					id="crafty-backup"
					v-model="backupCode"
					autocomplete="off"
					class="rounded-xl border border-divider bg-bg px-3 py-2 font-mono text-primary outline-none focus:border-brand"
					type="text"
					@keydown.enter="submitLogin"
				/>
			</div>
			<p v-if="loginError" class="m-0 text-sm text-red">{{ loginError }}</p>
			<ButtonStyled color="brand" size="large">
				<button class="flex items-center gap-2" type="button" @click="submitLogin">
					<LogInIcon aria-hidden="true" />
					{{ t('app.crafty-servers.sign-in') }}
				</button>
			</ButtonStyled>
		</div>

		<!-- Logged in toolbar -->
		<template v-else>
			<div class="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between">
				<div class="flex flex-wrap gap-2">
					<ButtonStyled type="standard">
						<button type="button" class="flex items-center gap-2" @click="signOutCrafty">
							{{ t('app.crafty-servers.sign-out') }}
						</button>
					</ButtonStyled>
					<ButtonStyled type="standard">
						<button type="button" class="flex items-center gap-2" @click="openCraftyPanel">
							<PlusIcon aria-hidden="true" />
							{{ t('app.crafty-servers.open-panel') }}
						</button>
					</ButtonStyled>
				</div>
				<div class="w-full md:max-w-sm">
					<StyledInput
						id="server-search"
						v-model="searchRaw"
						:placeholder="
							t('app.crafty-servers.search-ph', {
								count: filteredServers.length,
							})
						"
						wrapper-class="w-full"
					/>
				</div>
			</div>

			<p v-if="powerListError" class="m-0 rounded-xl border border-red bg-bg-red/40 px-3 py-2 text-sm text-red">
				{{ powerListError }}
			</p>

			<p v-if="serversQuery.isError.value" class="m-0 rounded-2xl border border-red bg-bg-red px-4 py-3 text-sm text-primary">
				<span>{{
					serversQuery.error instanceof Error ? serversQuery.error.message : String(serversQuery.error ?? '')
				}}</span>
				<ButtonStyled class="mt-3" type="standard">
					<button type="button" @click="serversQuery.refetch">{{ t('app.crafty-servers.retry-load') }}</button>
				</ButtonStyled>
			</p>

			<div
				v-else-if="loggedIn && !serversQuery.isPending.value && servers.length && filteredServers.length"
				class="grid gap-3 rounded-3xl border border-divider bg-bg-raised px-5 py-4 sm:grid-cols-4"
			>
				<div>
					<p class="m-0 text-xs font-semibold uppercase text-secondary">{{ t('app.crafty-servers.sum-total') }}</p>
					<p class="m-0 text-2xl font-bold text-contrast">{{ summary.total }}</p>
				</div>
				<div>
					<p class="m-0 text-xs font-semibold uppercase text-blue">{{ t('app.crafty-servers.sum-online') }}</p>
					<p class="m-0 text-xl font-semibold text-contrast">{{ summary.online }}</p>
				</div>
				<div>
					<p class="m-0 text-xs font-semibold uppercase text-secondary">{{ t('app.crafty-servers.sum-off-crashed') }}</p>
					<p class="m-0 text-xl font-semibold text-contrast">
						<span class="text-secondary">{{ summary.offline }}</span>
						<span class="text-secondary">/</span>
						<span class="text-red">{{ summary.crashed }}</span>
					</p>
				</div>
				<div>
					<p class="m-0 text-xs font-semibold uppercase text-secondary">{{ t('app.crafty-servers.sum-players') }}</p>
					<p class="m-0 text-xl font-semibold text-contrast">{{ summary.players }}</p>
					<p v-if="summary.statsFailed" class="m-0 text-xs text-orange">{{ t('app.crafty-servers.stats-partial') }}</p>
				</div>
			</div>
		</template>

		<div v-if="loggedIn && serversQuery.isPending.value" class="flex flex-col gap-3">
			<div
				v-for="i in 3"
				:key="i"
				class="flex animate-pulse flex-row items-center gap-4 rounded-2xl border border-solid border-button-bg bg-bg-raised p-4"
			>
				<div class="size-14 rounded-xl bg-button-bg"></div>
				<div class="flex flex-1 flex-col gap-2">
					<div class="h-5 w-40 rounded bg-button-bg"></div>
					<div class="h-4 w-56 rounded bg-button-bg opacity-75"></div>
				</div>
			</div>
		</div>

		<div v-else-if="showEmptyMarketing" class="flex justify-center">
			<ServerListEmpty logged-in :on-click-new-server="openCraftyPanel" :on-click-sign-in="signOutCrafty" />
		</div>

		<ul v-else-if="loggedIn && filteredServers.length > 0" class="m-0 flex list-none flex-col gap-3 p-0">
			<li v-for="s in filteredServers" :key="serverStableId(s)">
				<div
					class="flex flex-col gap-3 rounded-2xl border border-solid border-button-bg bg-bg-raised p-4 transition-colors hover:bg-bg-secondary sm:flex-row sm:items-stretch sm:justify-between sm:gap-4"
				>
					<button
						type="button"
						class="flex min-w-0 flex-1 cursor-pointer flex-row items-start gap-4 rounded-xl bg-transparent text-left outline-none ring-brand focus-visible:ring-2"
						@click="goToServer(serverStableId(s))"
					>
						<div class="relative grid size-14 shrink-0 place-content-center rounded-xl bg-brand-highlight">
							<img
								v-if="rowIconUrl(s)"
								class="size-12 rounded-lg object-cover"
								alt=""
								:src="rowIconUrl(s)!"
							/>
							<ServerStackIcon v-else class="size-8 text-brand" aria-hidden="true" />
						</div>
						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="flex flex-wrap items-center gap-2">
								<span class="truncate font-semibold text-contrast">{{ rowTitle(s) }}</span>
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
									:class="pillClasses(craftyLifecycle(statFor(serverStableId(s))))"
								>
									{{ lifecycleLabel(craftyLifecycle(statFor(serverStableId(s)))) }}
								</span>
								<span
									v-if="s.type"
									class="shrink-0 rounded-md border border-divider px-2 py-0.5 font-mono text-xs text-secondary"
								>{{ s.type }}</span>
								<span
									v-if="statStr(statFor(serverStableId(s)), 'version')"
									class="shrink-0 font-mono text-xs text-secondary"
								>{{ statStr(statFor(serverStableId(s)), 'version') }}</span>
							</div>
							<span v-if="rowAddress(s)" class="truncate font-mono text-sm text-secondary">{{ rowAddress(s) }}</span>
							<span v-else class="truncate font-mono text-xs text-secondary">{{ serverStableId(s) }}</span>

							<div class="flex flex-wrap gap-x-6 gap-y-2 text-xs">
								<span v-if="craftyPlayersSnippet(statFor(serverStableId(s)))" class="text-secondary">
									<strong class="text-contrast">{{ t('app.crafty-servers.players-short') }}</strong>
									{{ craftyPlayersSnippet(statFor(serverStableId(s))) }}
								</span>
								<div v-if="craftyCpuPercent(statFor(serverStableId(s))) != null" class="flex flex-col gap-1">
									<span class="font-semibold text-secondary">CPU</span>
									<div class="h-2 w-24 overflow-hidden rounded-full bg-secondary-bg">
										<div
											class="h-full rounded-full bg-blue"
											:style="{ width: `${craftyCpuPercent(statFor(serverStableId(s)))}%` }"
										/>
									</div>
								</div>
								<div v-if="craftyMemPercent(statFor(serverStableId(s))) != null" class="flex flex-col gap-1">
									<span class="font-semibold text-secondary">{{ t('app.crafty-servers.mem-short') }}</span>
									<div class="h-2 w-24 overflow-hidden rounded-full bg-secondary-bg">
										<div
											class="h-full rounded-full bg-brand"
											:style="{ width: `${craftyMemPercent(statFor(serverStableId(s)))}%` }"
										/>
									</div>
								</div>
							</div>
						</div>
					</button>

					<div class="flex shrink-0 flex-wrap items-center gap-2 border-t border-divider pt-3 sm:border-t-0 sm:pt-0" @click.stop>
						<ButtonStyled color="brand" type="standard">
							<button
								type="button"
								class="text-sm"
								:disabled="powerBusy === serverStableId(s)"
								@click="rowPower(serverStableId(s), 'start_server')"
							>
								{{ t('app.crafty-servers.act-start') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button
								type="button"
								class="text-sm"
								:disabled="powerBusy === serverStableId(s)"
								@click="rowPower(serverStableId(s), 'stop_server')"
							>
								{{ t('app.crafty-servers.act-stop') }}
							</button>
						</ButtonStyled>
						<ButtonStyled type="standard">
							<button
								type="button"
								class="text-sm"
								:disabled="powerBusy === serverStableId(s)"
								@click="rowPower(serverStableId(s), 'restart_server')"
							>
								{{ t('app.crafty-servers.act-restart') }}
							</button>
						</ButtonStyled>
						<ButtonStyled color="red" type="transparent">
							<button
								type="button"
								class="text-sm"
								:disabled="powerBusy === serverStableId(s)"
								@click="askKill(serverStableId(s))"
							>
								{{ t('app.crafty-servers.act-kill') }}
							</button>
						</ButtonStyled>
					</div>
				</div>
			</li>
		</ul>

		<p
			v-else-if="
				loggedIn && servers.length && !filteredServers.length && !serversQuery.isPending.value && !serversQuery.isError.value
			"
			class="text-sm text-secondary"
		>
			{{ t('app.crafty-servers.no-results') }}
		</p>

		<ConfirmModal
			ref="killModal"
			:danger="true"
			:title="t('app.crafty-servers.kill-title')"
			:markdown="false"
			:description="t('app.crafty-servers.kill-desc')"
			:proceed-label="t('app.crafty-servers.act-kill')"
			@proceed="confirmKill"
		/>
	</div>
</template>
