<script setup lang="ts">
import { ChevronRightIcon, LinkIcon } from '@modrinth/assets'
import {
	Admonition,
	ButtonStyled,
	defineMessages,
	injectNotificationManager,
	StyledInput,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import ModalWrapper from '@/components/ui/modal/ModalWrapper.vue'
import { list, profile_shared_world_link_create } from '@/helpers/profile'
import type { GameInstance } from '@/helpers/types'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const modal = ref<InstanceType<typeof ModalWrapper> | null>(null)

const sourceProfilePath = ref('')
const sourceWorldFolder = ref('')
const sourceProfileName = ref('')

const allInstances = ref<GameInstance[]>([])
const targetProfilePath = ref('')
const localFolderName = ref('')
const saving = ref(false)

const messages = defineMessages({
	title: {
		id: 'app.share-world-modal.title',
		defaultMessage: 'Share world to another instance',
	},
	warning: {
		id: 'app.share-world-modal.warning',
		defaultMessage:
			'Never run two instances that use the same world folder at once — your save can be corrupted.',
	},
	targetLabel: {
		id: 'app.share-world-modal.targetLabel',
		defaultMessage: 'Destination instance',
	},
	localNameLabel: {
		id: 'app.share-world-modal.localNameLabel',
		defaultMessage: 'Folder name on destination',
	},
	localNameHint: {
		id: 'app.share-world-modal.localNameHint',
		defaultMessage: 'Creates a symlink under the destination instance saves folder.',
	},
	submit: {
		id: 'app.share-world-modal.submit',
		defaultMessage: 'Create link',
	},
	cancel: {
		id: 'app.share-world-modal.cancel',
		defaultMessage: 'Cancel',
	},
})

const targetChoices = computed(() =>
	allInstances.value.filter((p) => p.path !== sourceProfilePath.value),
)

async function open(payload: {
	sourceProfilePath: string
	sourceWorldFolder: string
	sourceProfileName: string
}) {
	sourceProfilePath.value = payload.sourceProfilePath
	sourceWorldFolder.value = payload.sourceWorldFolder
	sourceProfileName.value = payload.sourceProfileName
	targetProfilePath.value = ''
	localFolderName.value = ''
	try {
		allInstances.value = await list()
	} catch (e) {
		handleError(e as Error)
		allInstances.value = []
	}
	modal.value?.show()
}

function hide() {
	modal.value?.hide()
}

async function submit() {
	const tgt = targetProfilePath.value
	const localName = localFolderName.value.trim()
	const src = sourceProfilePath.value
	const folder = sourceWorldFolder.value
	if (!tgt || !localName || !src || !folder) return

	saving.value = true
	try {
		await profile_shared_world_link_create(tgt, localName, src, folder)
		hide()
	} catch (e) {
		handleError(e as Error)
	} finally {
		saving.value = false
	}
}

defineExpose({ open })
</script>

<template>
	<ModalWrapper ref="modal">
		<template #title>
			<LinkIcon class="size-5 shrink-0" aria-hidden="true" />
			{{ sourceProfileName }}
			<ChevronRightIcon aria-hidden="true" />
			<span class="font-extrabold text-lg text-contrast">{{ formatMessage(messages.title) }}</span>
		</template>

		<div class="flex w-[min(440px,90vw)] flex-col gap-3">
			<Admonition type="warning">
				{{ formatMessage(messages.warning) }}
			</Admonition>

			<p class="m-0 text-sm text-secondary">
				<span class="font-semibold text-primary">{{ sourceWorldFolder }}</span>
			</p>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.targetLabel) }}</span>
				<select
					v-model="targetProfilePath"
					class="rounded-xl border border-divider bg-bg px-3 py-2 text-sm text-primary outline-none focus:border-brand"
				>
					<option disabled value="">{{ formatMessage(messages.targetLabel) }}</option>
					<option v-for="p in targetChoices" :key="p.path" :value="p.path">{{ p.name }}</option>
				</select>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.localNameLabel) }}</span>
				<StyledInput v-model="localFolderName" autocomplete="off" wrapper-class="w-full" />
				<span class="text-xs text-secondary">{{ formatMessage(messages.localNameHint) }}</span>
			</label>

			<div class="flex flex-wrap gap-2 pt-2">
				<ButtonStyled color="brand" :disabled="saving">
					<button type="button" :disabled="saving" @click="submit">
						{{ formatMessage(messages.submit) }}
					</button>
				</ButtonStyled>
				<ButtonStyled type="standard">
					<button type="button" @click="hide">{{ formatMessage(messages.cancel) }}</button>
				</ButtonStyled>
			</div>
		</div>
	</ModalWrapper>
</template>
