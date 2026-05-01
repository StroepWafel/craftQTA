<script setup lang="ts">
import { LinkIcon, SearchIcon, SpinnerIcon } from '@modrinth/assets'
import {
	ButtonStyled,
	defineMessages,
	EmptyState,
	StyledInput,
	useVIntl,
} from '@modrinth/ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ShareWorldToInstanceModal from '@/components/ui/world/modal/ShareWorldToInstanceModal.vue'
import { list } from '@/helpers/profile'
import type { GameInstance } from '@/helpers/types'
import { get_profile_worlds } from '@/helpers/worlds'
import type { SingleplayerWorld } from '@/helpers/worlds'

const { formatMessage } = useVIntl()
const router = useRouter()

const messages = defineMessages({
	title: {
		id: 'app.worlds-hub.title',
		defaultMessage: 'All worlds',
	},
	subtitle: {
		id: 'app.worlds-hub.subtitle',
		defaultMessage:
			'Single-player worlds across your instances. Share one into another instance without duplicating files.',
	},
	search: {
		id: 'app.worlds-hub.search',
		defaultMessage: 'Search worlds or instances…',
	},
	refresh: {
		id: 'app.worlds-hub.refresh',
		defaultMessage: 'Refresh',
	},
	openInstance: {
		id: 'app.worlds-hub.openInstance',
		defaultMessage: 'Open instance',
	},
	share: {
		id: 'app.worlds-hub.share',
		defaultMessage: 'Share…',
	},
	empty: {
		id: 'app.worlds-hub.empty',
		defaultMessage: 'No single-player worlds found.',
	},
	loading: {
		id: 'app.worlds-hub.loading',
		defaultMessage: 'Loading worlds…',
	},
})

type Row = {
	profile: GameInstance
	world: SingleplayerWorld
}

const loading = ref(true)
const rows = ref<Row[]>([])
const query = ref('')
const shareWorldModal = ref<InstanceType<typeof ShareWorldToInstanceModal> | null>(null)

async function loadAll() {
	loading.value = true
	try {
		const profiles = await list()
		const concurrency = 5
		const out: Row[] = []
		for (let start = 0; start < profiles.length; start += concurrency) {
			const slice = profiles.slice(start, start + concurrency)
			const chunk = (
				await Promise.all(
					slice.map(async (p) => {
						try {
							const worlds = await get_profile_worlds(p.path)
							const local: Row[] = []
							for (const w of worlds) {
								if (w.type === 'singleplayer') {
									local.push({ profile: p, world: w })
								}
							}
							return local
						} catch {
							return []
						}
					}),
				)
			).flat()
			out.push(...chunk)
		}
		out.sort((a, b) => (b.world.last_played ?? '').localeCompare(a.world.last_played ?? ''))
		rows.value = out
	} finally {
		loading.value = false
	}
}

onMounted(() => void loadAll())

const filteredRows = computed(() => {
	const q = query.value.trim().toLowerCase()
	if (!q) return rows.value
	return rows.value.filter(
		(r) =>
			r.world.name.toLowerCase().includes(q) ||
			r.profile.name.toLowerCase().includes(q) ||
			r.world.path.toLowerCase().includes(q),
	)
})

function goToInstanceWorlds(path: string) {
	void router.push(`/instance/${encodeURIComponent(path)}/worlds`)
}

function openShare(row: Row) {
	shareWorldModal.value?.open({
		sourceProfilePath: row.profile.path,
		sourceWorldFolder: row.world.path,
		sourceProfileName: row.profile.name,
	})
}
</script>

<template>
	<div class="experimental-styles-within mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 pb-16">
		<div class="flex flex-col gap-2 border-0 border-b border-solid border-divider pb-4">
			<h1 class="m-0 text-2xl font-extrabold text-contrast">{{ formatMessage(messages.title) }}</h1>
			<p class="m-0 text-secondary">{{ formatMessage(messages.subtitle) }}</p>
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<StyledInput
				v-model="query"
				:icon="SearchIcon"
				:placeholder="formatMessage(messages.search)"
				wrapper-class="min-w-[200px] flex-1 w-full"
			/>
			<ButtonStyled type="standard">
				<button type="button" @click="loadAll">{{ formatMessage(messages.refresh) }}</button>
			</ButtonStyled>
		</div>

		<div v-if="loading" class="flex flex-col items-center gap-3 py-16 text-secondary">
			<SpinnerIcon class="size-8 animate-spin" aria-hidden="true" />
			<span>{{ formatMessage(messages.loading) }}</span>
		</div>

		<EmptyState v-else-if="filteredRows.length === 0" type="empty-inbox" :heading="formatMessage(messages.empty)" />

		<ul v-else class="m-0 flex list-none flex-col gap-4 p-0">
			<li
				v-for="row in filteredRows"
				:key="`${row.profile.path}:${row.world.path}`"
				class="flex flex-col gap-2 rounded-2xl border border-solid border-divider bg-bg-raised p-3"
			>
				<div class="flex flex-wrap items-center justify-between gap-2">
					<p class="m-0 text-sm font-semibold text-secondary">
						{{ row.profile.name }}
						<span class="font-mono font-normal text-xs opacity-80">· {{ row.world.path }}</span>
					</p>
					<div class="flex flex-wrap gap-2">
						<ButtonStyled type="standard">
							<button type="button" @click="goToInstanceWorlds(row.profile.path)">
								{{ formatMessage(messages.openInstance) }}
							</button>
						</ButtonStyled>
						<ButtonStyled color="brand">
							<button type="button" class="flex items-center gap-2" @click="openShare(row)">
								<LinkIcon class="size-4" aria-hidden="true" />
								{{ formatMessage(messages.share) }}
							</button>
						</ButtonStyled>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-3 px-1 pb-1 pt-2">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="text-lg font-bold text-contrast">{{ row.world.name }}</span>
					</div>
				</div>
			</li>
		</ul>

		<ShareWorldToInstanceModal ref="shareWorldModal" />
	</div>
</template>
