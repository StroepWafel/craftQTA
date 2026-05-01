<script setup lang="ts">
import { SpinnerIcon, TrashIcon } from '@modrinth/assets'
import {
	Admonition,
	ButtonStyled,
	defineMessages,
	injectNotificationManager,
	StyledInput,
	useVIntl,
} from '@modrinth/ui'
import { computed, onMounted, ref, watch } from 'vue'

import {
	list,
	profile_shared_world_link_create,
	profile_shared_world_link_list,
	profile_shared_world_link_remove,
	type ProfileSharedWorldLink,
} from '@/helpers/profile'
import { get_profile_worlds } from '@/helpers/worlds'
import { injectInstanceSettings } from '@/providers/instance-settings'

import type { GameInstance } from '@/helpers/types'
import type { SingleplayerWorld } from '@/helpers/worlds'

const messages = defineMessages({
	warning: {
		id: 'instance.settings.sharedWorlds.warning',
		defaultMessage:
			'Never run two instances that use the same world folder at the same time — your save can be corrupted.',
	},
	tabHeading: {
		id: 'instance.settings.sharedWorlds.heading',
		defaultMessage: 'Share a single-player world folder',
	},
	tabIntro: {
		id: 'instance.settings.sharedWorlds.intro',
		defaultMessage:
			'Creates a symlink under this instance’s saves folder pointing at another instance’s world folder.',
	},
	localNameLabel: {
		id: 'instance.settings.sharedWorlds.localNameLabel',
		defaultMessage: 'Local folder name',
	},
	targetInstanceLabel: {
		id: 'instance.settings.sharedWorlds.targetInstanceLabel',
		defaultMessage: 'Source instance',
	},
	targetWorldLabel: {
		id: 'instance.settings.sharedWorlds.targetWorldLabel',
		defaultMessage: 'Source world',
	},
	create: {
		id: 'instance.settings.sharedWorlds.create',
		defaultMessage: 'Create link',
	},
	existingHeading: {
		id: 'instance.settings.sharedWorlds.existingHeading',
		defaultMessage: 'Existing links',
	},
	remove: {
		id: 'instance.settings.sharedWorlds.remove',
		defaultMessage: 'Remove',
	},
	noneYet: {
		id: 'instance.settings.sharedWorlds.noneYet',
		defaultMessage: 'No shared world links yet.',
	},
})

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { instance } = injectInstanceSettings()

const loading = ref(true)
const saving = ref(false)
const links = ref<ProfileSharedWorldLink[]>([])

const allInstances = ref<GameInstance[]>([])

const otherInstances = computed(() =>
	allInstances.value.filter((p) => p.path !== instance.value.path),
)

function instanceLabel(path: string) {
	return allInstances.value.find((p) => p.path === path)?.name ?? path
}

const targetProfilePath = ref('')
const targetWorldId = ref('')
const localFolderName = ref('')

const targetWorlds = ref<SingleplayerWorld[]>([])
const loadingWorlds = ref(false)

async function refreshLinks() {
	try {
		links.value = await profile_shared_world_link_list(instance.value.path)
	} catch (e) {
		handleError(e as Error)
	}
}

async function loadInstances() {
	try {
		allInstances.value = await list()
	} catch (e) {
		handleError(e as Error)
	}
}

async function loadTargetWorlds(path: string) {
	if (!path) {
		targetWorlds.value = []
		targetWorldId.value = ''
		return
	}
	loadingWorlds.value = true
	try {
		const worlds = await get_profile_worlds(path)
		targetWorlds.value = worlds.filter((w): w is SingleplayerWorld => w.type === 'singleplayer')
		if (
			targetWorldId.value &&
			!targetWorlds.value.some((w) => w.path === targetWorldId.value)
		) {
			targetWorldId.value = ''
		}
	} catch (e) {
		handleError(e as Error)
		targetWorlds.value = []
	} finally {
		loadingWorlds.value = false
	}
}

watch(targetProfilePath, (path) => void loadTargetWorlds(path))

onMounted(async () => {
	loading.value = true
	await Promise.all([refreshLinks(), loadInstances()])
	loading.value = false
})

async function createLink() {
	const localName = localFolderName.value.trim()
	const tgtPath = targetProfilePath.value
	const tgtWorld = targetWorldId.value.trim()
	if (!localName || !tgtPath || !tgtWorld) return

	saving.value = true
	try {
		await profile_shared_world_link_create(instance.value.path, localName, tgtPath, tgtWorld)
		localFolderName.value = ''
		await refreshLinks()
	} catch (e) {
		handleError(e as Error)
	} finally {
		saving.value = false
	}
}

async function removeLink(folder: string) {
	try {
		await profile_shared_world_link_remove(instance.value.path, folder)
		await refreshLinks()
	} catch (e) {
		handleError(e as Error)
	}
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div v-if="loading" class="flex items-center gap-2 text-secondary">
			<SpinnerIcon class="size-4 shrink-0 animate-spin" />
			<span>Loading…</span>
		</div>

		<template v-else>
			<Admonition type="warning">
				{{ formatMessage(messages.warning) }}
			</Admonition>

			<div class="flex flex-col gap-1">
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.tabHeading) }}
				</h3>
				<p class="m-0 text-sm text-secondary">
					{{ formatMessage(messages.tabIntro) }}
				</p>
			</div>

			<div class="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-raised p-4">
				<label class="flex flex-col gap-1">
					<span class="text-sm font-semibold text-primary">{{
						formatMessage(messages.localNameLabel)
					}}</span>
					<StyledInput v-model="localFolderName" placeholder="SharedWorld" />
				</label>

				<label class="flex flex-col gap-1">
					<span class="text-sm font-semibold text-primary">{{
						formatMessage(messages.targetInstanceLabel)
					}}</span>
					<select
						v-model="targetProfilePath"
						class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm text-primary outline-none focus:border-brand"
					>
						<option disabled value="">Select instance</option>
						<option v-for="p in otherInstances" :key="p.path" :value="p.path">
							{{ p.name }}
						</option>
					</select>
				</label>

				<label class="flex flex-col gap-1">
					<span class="text-sm font-semibold text-primary">{{
						formatMessage(messages.targetWorldLabel)
					}}</span>
					<select
						v-model="targetWorldId"
						class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm text-primary outline-none focus:border-brand"
						:disabled="!targetProfilePath || loadingWorlds"
					>
						<option disabled value="">Select world</option>
						<option v-for="w in targetWorlds" :key="w.path" :value="w.path">
							{{ w.name }}
						</option>
					</select>
				</label>

				<ButtonStyled color="brand" :disabled="saving">
					<button type="button" :disabled="saving" @click="createLink">
						{{ formatMessage(messages.create) }}
					</button>
				</ButtonStyled>
			</div>

			<div class="flex flex-col gap-2">
				<h4 class="m-0 text-base font-semibold text-contrast">
					{{ formatMessage(messages.existingHeading) }}
				</h4>
				<p v-if="links.length === 0" class="m-0 text-sm text-secondary">
					{{ formatMessage(messages.noneYet) }}
				</p>
				<ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
					<li
						v-for="link in links"
						:key="link.local_world_folder"
						class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider bg-bg-raised px-3 py-2"
					>
						<div class="flex min-w-0 flex-col gap-0.5">
							<span class="truncate font-mono text-sm font-semibold text-primary">{{
								link.local_world_folder
							}}</span>
							<span class="truncate text-xs text-secondary">
								→ {{ instanceLabel(link.target_profile_path) }} /
								{{ link.target_world_folder }}
							</span>
						</div>
						<ButtonStyled type="standard">
							<button type="button" @click="removeLink(link.local_world_folder)">
								<TrashIcon class="size-4" />
								{{ formatMessage(messages.remove) }}
							</button>
						</ButtonStyled>
					</li>
				</ul>
			</div>
		</template>
	</div>
</template>
