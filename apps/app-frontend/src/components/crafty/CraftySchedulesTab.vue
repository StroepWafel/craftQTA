<script setup lang="ts">
import type { Crafty } from '@modrinth/api-client'
import { ModrinthApiError } from '@modrinth/api-client'
import { ButtonStyled, ConfirmModal } from '@modrinth/ui'
import { injectModrinthClient } from '@modrinth/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
	serverId: string
	craftyApiCacheKey: string
	craftyJwtKey: string
}>()

const { t } = useI18n()
const client = injectModrinthClient()
const qc = useQueryClient()

/** Crafty exposes `POST /tasks` and `GET /tasks/:id` but upstream leaves `GET /tasks` empty, so listing must fall back (see crafty-4 `tasks/index.py`). */
function scheduleIdsStorageKey(sid: string): string {
	return `craftqta.crafty.scheduleIds.${sid}`
}

function readStoredScheduleIds(sid: string): number[] {
	if (typeof localStorage === 'undefined') return []
	try {
		const raw = localStorage.getItem(scheduleIdsStorageKey(sid))
		if (!raw) return []
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) return []
		return [...new Set(parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n)))]
	} catch {
		return []
	}
}

function persistScheduleIds(sid: string, ids: number[]): void {
	if (typeof localStorage === 'undefined') return
	localStorage.setItem(scheduleIdsStorageKey(sid), JSON.stringify([...new Set(ids)].sort((a, b) => a - b)))
}

function rememberScheduleId(sid: string, scheduleId: number): void {
	if (!Number.isFinite(scheduleId)) return
	persistScheduleIds(sid, [...readStoredScheduleIds(sid), scheduleId])
}

function forgetScheduleId(sid: string, idStr: string): void {
	const n = Number(idStr)
	if (!Number.isFinite(n)) return
	persistScheduleIds(
		sid,
		readStoredScheduleIds(sid).filter((x) => x !== n),
	)
}

function pruneScheduleIdIfNotFound(error: unknown, sid: string, id: number): void {
	const code =
		error instanceof ModrinthApiError
			? error.statusCode
			: (error as { statusCode?: number })?.statusCode
	if (code === 404) persistScheduleIds(sid, readStoredScheduleIds(sid).filter((x) => x !== id))
}

function looksCraftyScheduleRow(o: Record<string, unknown>): boolean {
	const sidRaw = o.schedule_id ?? o.task_id ?? o.job_id ?? o.id
	const hasId =
		(typeof sidRaw === 'number' && Number.isFinite(sidRaw)) ||
		(typeof sidRaw === 'string' && sidRaw.trim().length > 0)
	const nameOk = typeof o.name === 'string' && o.name.length > 0
	return Boolean(hasId && nameOk)
}

function unwrapSingleTask(raw: Record<string, unknown>): Record<string, unknown> | null {
	if (looksCraftyScheduleRow(raw)) return raw
	const st = raw.status
	const ok = typeof st === 'string' && st.toLowerCase() === 'ok'
	if (
		ok &&
		raw.data !== undefined &&
		raw.data !== null &&
		typeof raw.data === 'object' &&
		!Array.isArray(raw.data)
	) {
		const d = raw.data as Record<string, unknown>
		if (looksCraftyScheduleRow(d)) return d
	}
	return null
}

function dedupeTasksByScheduleId(rows: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
	const map = new Map<string, Record<string, unknown>>()
	for (const r of rows) {
		const sidRaw = r.schedule_id ?? r.task_id ?? r.id ?? r.job_id ?? r.uuid
		const sid =
			sidRaw === undefined || sidRaw === null ? '' : String(sidRaw).trim()
		if (!sid) continue
		if (!map.has(sid)) map.set(sid, r)
	}
	return map
}

function formatQueryUnknownError(e: unknown): string {
	if (e instanceof Error) return e.message
	if (typeof e === 'object' && e !== null) {
		const m = (e as { message?: unknown }).message
		if (typeof m === 'string' && m.trim()) return m
		const err = (e as { error?: unknown }).error
		if (typeof err === 'string' && err.trim()) return err
		const sd = (e as { statusCode?: number }).statusCode
		if (typeof sd === 'number') return `HTTP ${sd}`
		try {
			return JSON.stringify(e)
		} catch {
			return String(e)
		}
	}
	return typeof e === 'string' ? e : String(e)
}

function wrapTasksPayload(raw: unknown): Record<string, unknown> {
	if (Array.isArray(raw)) return { _tasks_array: raw }
	if (raw && typeof raw === 'object') return raw as Record<string, unknown>
	return {}
}

function unwrapTasksData(raw: Record<string, unknown>): unknown {
	if (Array.isArray(raw._tasks_array)) return raw._tasks_array

	const st = raw.status
	if (typeof st === 'string') {
		const lc = st.toLowerCase()
		if (lc === 'error' || lc === 'failed' || lc === 'fail') return []
		if (lc === 'ok' && raw.data !== undefined && raw.data !== null) return raw.data
	}
	if (typeof st === 'boolean') {
		if (!st) return []
		if (raw.data !== undefined && raw.data !== null) return raw.data
	}
	if (raw.data !== undefined && raw.data !== null) return raw.data
	return raw
}

function extractTaskObjects(payload: unknown): Record<string, unknown>[] {
	if (Array.isArray(payload)) {
		return payload.flatMap((item) =>
			item && typeof item === 'object' ? [item as Record<string, unknown>] : [],
		)
	}
	if (!payload || typeof payload !== 'object') return []
	const o = payload as Record<string, unknown>

	if (looksCraftyScheduleRow(o)) return [o]

	for (const key of ['tasks', 'schedule', 'schedules', 'cron_jobs', 'data', 'children']) {
		if (key in o && o[key] != null) {
			const nested = extractTaskObjects(o[key])
			if (nested.length) return nested
		}
	}

	const rows: Record<string, unknown>[] = []
	for (const [, v] of Object.entries(o)) {
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			const rec = v as Record<string, unknown>
			if (looksCraftyScheduleRow(rec)) rows.push(rec)
		}
	}
	return rows
}

function normalizeTasks(raw: Record<string, unknown>): {
	id: string
	label: string
	raw: Record<string, unknown>
}[] {
	const payload = unwrapTasksData(raw)
	const objects = extractTaskObjects(payload)
	const rows: { id: string; label: string; raw: Record<string, unknown> }[] = []
	for (const o of objects) {
		const id = String(o.schedule_id ?? o.task_id ?? o.id ?? o.job_id ?? o.uuid ?? rows.length)
		const name = String(o.name ?? o.job_name ?? o.title ?? id)
		const action = String(o.action ?? '')
		rows.push({ id, label: `${name} · ${action}`.slice(0, 220), raw: o })
	}
	return rows.sort((a, b) => a.label.localeCompare(b.label))
}

const tasksQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'tasks',
		props.serverId,
		props.craftyJwtKey,
		props.craftyApiCacheKey,
	]),
	queryFn: async () => {
		let listObjs: Record<string, unknown>[] = []

		try {
			const rawList = await client.crafty.v2.listServerTasks(props.serverId, {
				timeout: 6500,
				retry: false,
			})
			const wrappedList = wrapTasksPayload(rawList as unknown)
			listObjs = extractTaskObjects(unwrapTasksData(wrappedList))
		} catch {
			/* Unimplemented GET or network — continue with cached IDs */
		}

		const fetchedById: Record<string, unknown>[] = []
		for (const id of readStoredScheduleIds(props.serverId)) {
			try {
				const raw = await client.crafty.v2.getServerTask(props.serverId, String(id), {
					timeout: 8000,
					retry: false,
				})
				const row = unwrapSingleTask(raw as Record<string, unknown>)
				if (row && looksCraftyScheduleRow(row)) fetchedById.push(row)
			} catch (e) {
				pruneScheduleIdIfNotFound(e, props.serverId, id)
			}
		}

		const merged = [...dedupeTasksByScheduleId([...listObjs, ...fetchedById]).values()]
		const nextIds = merged
			.map((r) => Number(r.schedule_id ?? r.task_id ?? r.id))
			.filter((n) => Number.isFinite(n))
		if (nextIds.length) persistScheduleIds(props.serverId, nextIds)

		return wrapTasksPayload(merged)
	},
	enabled: computed(() => Boolean(props.serverId && props.craftyJwtKey)),
	staleTime: 8000,
})

const rows = computed(() => normalizeTasks(tasksQuery.data.value ?? {}))

const name = ref('')
const action = ref('command')
const command = ref('say hello')
const cron = ref('')
const interval = ref(1)
const intervalType = ref<'hours' | 'minutes' | 'days' | ''>('hours')

async function createTaskNow() {
	const n = name.value.trim()
	if (!n) return
	const body: Record<string, unknown> = {
		name: n,
		enabled: true,
		action: action.value.trim() || 'command',
		delay: 0,
		one_time: false,
	}
	const cr = cron.value.trim()
	if (cr) {
		body.cron_string = cr
		body.interval_type = ''
		body.interval = interval.value || 1
	} else {
		body.interval = interval.value || 1
		body.interval_type = intervalType.value || 'hours'
	}
	const c = command.value.trim()
	if (c) body.command = c
	const res = await client.crafty.v2.createServerTask(props.serverId, body)
	if (typeof res.status === 'string' && res.status.toLowerCase() !== 'ok') {
		throw new Error(res.error ?? res.error_data ?? '')
	}

	const created = res as Crafty.v2.StatusOK & { data?: { schedule_id?: number } }
	const sid = Number(created.data?.schedule_id)
	if (Number.isFinite(sid)) rememberScheduleId(props.serverId, sid)

	name.value = ''
	await qc.invalidateQueries({ queryKey: ['crafty', 'tasks', props.serverId] })
}


async function runTask(id: string) {
	const res = await client.crafty.v2.runServerTask(props.serverId, id)
	if (typeof res.status === 'string' && res.status.toLowerCase() !== 'ok')
		throw new Error(res.error ?? res.error_data ?? '')
	await qc.invalidateQueries({ queryKey: ['crafty', 'tasks', props.serverId] })
}

const delModal = ref<InstanceType<typeof ConfirmModal> | null>(null)
const pendingDel = ref<string | null>(null)

function askScheduleDelete(id: string) {
	pendingDel.value = id
	delModal.value?.show()
}

const delMut = useMutation({
	mutationFn: async () => {
		const id = pendingDel.value
		if (!id) return
		const res = await client.crafty.v2.deleteServerTask(props.serverId, id)
		if (typeof res.status === 'string' && res.status.toLowerCase() !== 'ok')
			throw new Error(res.error ?? res.error_data ?? '')
		forgetScheduleId(props.serverId, id)
	},
	onSuccess: async () => {
		await qc.invalidateQueries({ queryKey: ['crafty', 'tasks', props.serverId] })
	},
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.tasks-intro') }}</p>

		<div class="rounded-2xl border border-divider bg-bg-raised p-4">
			<h3 class="m-0 text-base font-semibold text-contrast">{{ t('app.crafty-servers.new-task') }}</h3>
			<div class="mt-3 grid gap-3 md:grid-cols-2">
				<label class="flex flex-col gap-1 text-xs text-secondary">
					<span>{{ t('app.crafty-servers.task-name') }}</span>
					<input v-model="name" class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand" />
				</label>
				<label class="flex flex-col gap-1 text-xs text-secondary">
					<span>{{ t('app.crafty-servers.task-action') }}</span>
					<select v-model="action" class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand">
						<option value="command">command</option>
						<option value="backup">backup</option>
						<option value="restart">restart</option>
						<option value="start">start</option>
						<option value="stop">stop</option>
					</select>
				</label>
				<label class="flex flex-col gap-1 text-xs text-secondary md:col-span-2">
					<span>{{ t('app.crafty-servers.task-command') }}</span>
					<input
						v-model="command"
						class="rounded-xl border border-divider bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-brand"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-secondary">
					<span>{{ t('app.crafty-servers.task-interval-value') }}</span>
					<input
						v-model.number="interval"
						type="number"
						min="1"
						class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-secondary">
					<span>{{ t('app.crafty-servers.task-interval-type') }}</span>
					<select v-model="intervalType" class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm outline-none focus:border-brand">
						<option value="hours">hours</option>
						<option value="minutes">minutes</option>
						<option value="days">days</option>
						<option value="">(use cron)</option>
					</select>
				</label>
				<label class="flex flex-col gap-1 text-xs text-secondary md:col-span-2">
					<span>{{ t('app.crafty-servers.task-cron') }}</span>
					<input
						v-model="cron"
						:placeholder="t('app.crafty-servers.task-cron-ph')"
						class="rounded-xl border border-divider bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-brand"
					/>
				</label>
			</div>
			<ButtonStyled class="mt-4" color="brand">
				<button type="button" @click="createTaskNow()">{{ t('app.crafty-servers.create-task') }}</button>
			</ButtonStyled>
		</div>

		<p v-if="tasksQuery.isPending.value" class="text-sm text-secondary">{{ t('app.crafty-servers.loading-tasks') }}</p>
		<p v-else-if="tasksQuery.isError.value" class="text-sm text-orange">{{ formatQueryUnknownError(tasksQuery.error.value) }}</p>
		<ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
			<li
				v-for="r in rows"
				:key="r.id"
				class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-divider bg-bg-raised px-4 py-3"
			>
				<div class="min-w-0">
					<p class="m-0 font-mono text-sm text-contrast">{{ r.id }}</p>
					<p class="m-0 text-xs text-secondary">{{ r.label }}</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<ButtonStyled type="standard">
						<button type="button" @click="void runTask(r.id)">{{ t('app.crafty-servers.run-task') }}</button>
					</ButtonStyled>
					<ButtonStyled color="red" type="standard">
						<button type="button" @click="askScheduleDelete(r.id)">{{ t('app.crafty-servers.delete-task') }}</button>
					</ButtonStyled>
				</div>
			</li>
			<li v-if="rows.length === 0" class="text-sm text-secondary">{{ t('app.crafty-servers.no-tasks') }}</li>
		</ul>

		<details class="rounded-2xl border border-divider bg-bg-raised p-4">
			<summary class="cursor-pointer font-semibold">{{ t('app.crafty-servers.raw-json') }}</summary>
			<pre class="max-h-64 overflow-auto text-xs">{{ JSON.stringify(tasksQuery.data.value ?? {}, null, 2) }}</pre>
		</details>

		<ConfirmModal
			ref="delModal"
			:danger="true"
			:title="t('app.crafty-servers.delete-task-title')"
			:markdown="false"
			:description="pendingDel ?? ''"
			:proceed-label="t('app.crafty-servers.delete-proceed')"
			@proceed="delMut.mutate()"
		/>
	</div>
</template>
