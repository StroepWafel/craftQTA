<script setup lang="ts">
import { ServerStackIcon } from '@modrinth/assets'
import {
	Admonition,
	ButtonStyled,
	defineMessages,
	StyledInput,
	useVIntl,
} from '@modrinth/ui'
import { ref, watch } from 'vue'

import { branding } from '@/branding'
import { config } from '@/config'
import {
	craftyApiBaseOverride,
	craftyWebUrlOverride,
	resetCraftyEndpointOverrides,
	saveCraftyEndpointOverrides,
	trimCraftyUrl,
} from '@/helpers/crafty-endpoints'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: {
		id: 'app.settings.crafty.title',
		defaultMessage: 'Crafty Controller',
	},
	description: {
		id: 'app.settings.crafty.description',
		defaultMessage:
			'Override the Crafty API origin and web panel URL if your controller uses a custom HTTPS host. Leave blank to use the app default.',
	},
	apiLabel: {
		id: 'app.settings.crafty.apiLabel',
		defaultMessage: 'API base URL',
	},
	apiPlaceholder: {
		id: 'app.settings.crafty.apiPlaceholder',
		defaultMessage: 'Default: branding / environment',
	},
	webLabel: {
		id: 'app.settings.crafty.webLabel',
		defaultMessage: 'Web panel URL',
	},
	webPlaceholder: {
		id: 'app.settings.crafty.webPlaceholder',
		defaultMessage: 'Opens in browser from Servers pages',
	},
	save: {
		id: 'app.settings.crafty.save',
		defaultMessage: 'Save',
	},
	reset: {
		id: 'app.settings.crafty.reset',
		defaultMessage: 'Reset to defaults',
	},
	defaultApiHint: {
		id: 'app.settings.crafty.defaultApiHint',
		defaultMessage: 'Current default API: {url}',
	},
	defaultWebHint: {
		id: 'app.settings.crafty.defaultWebHint',
		defaultMessage: 'Current default web: {url}',
	},
	invalidHttps: {
		id: 'app.settings.crafty.invalidHttps',
		defaultMessage: 'URLs must start with https://',
	},
	invalidUrl: {
		id: 'app.settings.crafty.invalidUrl',
		defaultMessage: 'Enter a valid URL or leave the field empty.',
	},
})

const apiDraft = ref('')
const webDraft = ref('')
const validationError = ref<string | null>(null)

watch(
	[craftyApiBaseOverride, craftyWebUrlOverride],
	() => {
		apiDraft.value = craftyApiBaseOverride.value
		webDraft.value = craftyWebUrlOverride.value
	},
	{ immediate: true },
)

function validateHttpsOptional(raw: string): string | null {
	const t = raw.trim()
	if (!t) return null
	if (!t.startsWith('https://')) {
		return formatMessage(messages.invalidHttps)
	}
	try {
		new URL(t)
	} catch {
		return formatMessage(messages.invalidUrl)
	}
	return null
}

function save() {
	validationError.value = validateHttpsOptional(apiDraft.value)
	if (validationError.value) return
	validationError.value = validateHttpsOptional(webDraft.value)
	if (validationError.value) return

	saveCraftyEndpointOverrides(apiDraft.value.trim(), webDraft.value.trim())
	validationError.value = null
}

function reset() {
	resetCraftyEndpointOverrides()
	validationError.value = null
}

const defaultApi = trimCraftyUrl(branding.craftyApiBaseUrl || config.craftyBaseUrl)
const defaultWeb = trimCraftyUrl(branding.craftyWebUrl || config.craftyWebUrl)
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			<h3 class="m-0 flex items-center gap-2 text-lg font-semibold text-contrast">
				<ServerStackIcon class="size-5" aria-hidden="true" />
				{{ formatMessage(messages.title) }}
			</h3>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.description) }}</p>
			<p class="m-0 text-xs text-secondary">{{ formatMessage(messages.defaultApiHint, { url: defaultApi }) }}</p>
			<p class="m-0 text-xs text-secondary">{{ formatMessage(messages.defaultWebHint, { url: defaultWeb }) }}</p>
		</div>

		<Admonition type="warning">
			Custom HTTPS hosts require connectivity permission in this desktop fork (broad HTTPS access is enabled).
		</Admonition>

		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.apiLabel) }}</span>
				<StyledInput v-model="apiDraft" :placeholder="formatMessage(messages.apiPlaceholder)" type="url" />
			</div>
			<div class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.webLabel) }}</span>
				<StyledInput v-model="webDraft" :placeholder="formatMessage(messages.webPlaceholder)" type="url" />
			</div>
			<p v-if="validationError" class="m-0 text-sm text-red">{{ validationError }}</p>
			<div class="flex flex-wrap gap-2">
				<ButtonStyled color="brand">
					<button type="button" @click="save">{{ formatMessage(messages.save) }}</button>
				</ButtonStyled>
				<ButtonStyled type="standard">
					<button type="button" @click="reset">{{ formatMessage(messages.reset) }}</button>
				</ButtonStyled>
			</div>
		</div>
	</div>
</template>
