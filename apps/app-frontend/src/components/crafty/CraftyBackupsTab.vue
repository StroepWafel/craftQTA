<script setup lang="ts">
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

function unwrapData(raw: Record<string, unknown>): unknown {
	if (
		typeof raw.status === 'string' &&
		raw.status.toLowerCase() === 'ok' &&
		raw.data !== undefined &&
		raw.data !== null
	)
		return raw.data
	return raw
}

function toBackupRows(raw: Record<string, unknown>): { id: string; label: string; payload: Record<string, unknown> }[] {
	const d = unwrapData(raw)
	const out: { id: string; label: string; payload: Record<string, unknown> }[] = []
	if (Array.isArray(d)) {
		for (const item of d) {
			if (item && typeof item === 'object') {
				const o = item as Record<string, unknown>
				const id = String(o.backup_id ?? o.id ?? o.uuid ?? o.name ?? out.length)
				const label =
					String(o.backup_name ?? o.name ?? o.created ?? id).slice(0, 240) ||
					t('app.crafty-servers.backup-unknown')
				out.push({ id, label, payload: o })
			}
		}
		return out
	}
	if (d && typeof d === 'object' && !Array.isArray(d)) {
		const o = d as Record<string, unknown>
		if (typeof o.backups === 'object' && o.backups !== null) {
			return toBackupRows({ ...raw, data: o.backups })
		}
		for (const [k, v] of Object.entries(o)) {
			if (v && typeof v === 'object') {
				const row = v as Record<string, unknown>
				out.push({
					id: String(row.backup_id ?? row.id ?? k),
					label: String(row.backup_name ?? row.name ?? row.created ?? k).slice(0, 240),
					payload: row,
				})
			}
		}
	}
	return out.sort((a, b) => b.label.localeCompare(a.label))
}

const backupsQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'backups',
		props.serverId,
		props.craftyJwtKey,
		props.craftyApiCacheKey,
	]),
	queryFn: async () => client.crafty.v2.listServerBackups(props.serverId) as Promise<Record<string, unknown>>,
	enabled: computed(() => Boolean(props.serverId && props.craftyJwtKey)),
	staleTime: 8000,
})

const backups = computed(() => {
	const raw = backupsQuery.data.value ?? {}
	try {
		return toBackupRows(raw)
	} catch {
		return []
	}
})

const restoreModal = ref<InstanceType<typeof ConfirmModal> | null>(null)
const pendingRestore = ref<{ id: string } | null>(null)
const restoreFilename = ref('')

function askRestore(id: string) {
	pendingRestore.value = { id }
	restoreFilename.value = ''
	restoreModal.value?.show()
}

const restoreBusy = ref(false)

async function proceedRestore() {
	const p = pendingRestore.value
	const fn = restoreFilename.value.trim()
	if (!p?.id || fn.length < 5) return
	restoreBusy.value = true
	try {
		const res = await client.crafty.v2.restoreServerBackup(props.serverId, p.id, {
			filename: fn,
			inPlace: true,
		})
		if (typeof res.status === 'string' && res.status.toLowerCase() !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? 'Restore failed')
		}
		await qc.invalidateQueries({ queryKey: ['crafty', 'backups', props.serverId] })
		pendingRestore.value = null
	} finally {
		restoreBusy.value = false
	}
}

const delModal = ref<InstanceType<typeof ConfirmModal> | null>(null)
const pendingDeleteId = ref<string | null>(null)

function askDeleteBackup(id: string) {
	pendingDeleteId.value = id
	delModal.value?.show()
}

const deleteMut = useMutation({
	mutationFn: async () => {
		const id = pendingDeleteId.value
		if (!id) return
		const res = await client.crafty.v2.deleteServerBackup(props.serverId, id)
		if (typeof res.status === 'string' && res.status.toLowerCase() !== 'ok') {
			throw new Error(res.error ?? res.error_data ?? 'Delete failed')
		}
	},
	onSuccess: async () => {
		await qc.invalidateQueries({ queryKey: ['crafty', 'backups', props.serverId] })
	},
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.backups-intro') }}</p>
		<p v-if="backupsQuery.isPending.value" class="text-sm text-secondary">{{ t('app.crafty-servers.loading-backups') }}</p>
		<p v-else-if="backupsQuery.isError.value" class="text-sm text-orange">
			{{ backupsQuery.error instanceof Error ? backupsQuery.error.message : String(backupsQuery.error) }}
		</p>
		<ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
			<li
				v-for="b in backups"
				:key="b.id"
				class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-divider bg-bg-raised px-4 py-3"
			>
				<div class="min-w-0">
					<p class="m-0 font-mono text-sm text-contrast">{{ b.id }}</p>
					<p class="m-0 text-xs text-secondary">{{ b.label }}</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<ButtonStyled type="standard">
						<button type="button" @click="askRestore(b.id)">{{ t('app.crafty-servers.restore-backup') }}</button>
					</ButtonStyled>
					<ButtonStyled color="red" type="standard">
						<button type="button" @click="askDeleteBackup(b.id)">{{ t('app.crafty-servers.delete-backup') }}</button>
					</ButtonStyled>
				</div>
			</li>
			<li v-if="backups.length === 0" class="text-sm text-secondary">{{ t('app.crafty-servers.no-backups') }}</li>
		</ul>

		<details class="rounded-2xl border border-divider bg-bg-raised p-4">
			<summary class="cursor-pointer font-semibold text-contrast">{{ t('app.crafty-servers.raw-json') }}</summary>
			<pre class="max-h-64 overflow-auto text-xs">{{ JSON.stringify(backupsQuery.data.value ?? {}, null, 2) }}</pre>
		</details>

		<ConfirmModal
			ref="restoreModal"
			:title="t('app.crafty-servers.restore-title')"
			:markdown="false"
			:description="t('app.crafty-servers.restore-filename-help')"
			:proceed-label="t('app.crafty-servers.restore-proceed')"
			@proceed="proceedRestore"
		>
			<input
				v-model="restoreFilename"
				class="w-full rounded-xl border border-divider bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-brand"
				type="text"
				autocomplete="off"
			/>
		</ConfirmModal>

		<ConfirmModal
			ref="delModal"
			:danger="true"
			:title="t('app.crafty-servers.delete-backup-title')"
			:markdown="false"
			:description="pendingDeleteId ?? ''"
			:proceed-label="t('app.crafty-servers.delete-proceed')"
			@proceed="deleteMut.mutate()"
		/>
	</div>
</template>
