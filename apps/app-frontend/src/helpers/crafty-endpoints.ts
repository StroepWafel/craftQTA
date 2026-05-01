import { computed, ref } from 'vue'

const STORAGE_API = 'craftqta.crafty.apiBaseUrl'
const STORAGE_WEB = 'craftqta.crafty.webUrl'

export function trimCraftyUrl(url: string): string {
	return url.trim().replace(/\/$/, '')
}

function loadStored(key: string): string {
	if (typeof localStorage === 'undefined') return ''
	return trimCraftyUrl(localStorage.getItem(key) ?? '')
}

/** Empty string means “use app default (env / branding)”. */
export const craftyApiBaseOverride = ref(loadStored(STORAGE_API))

/** Empty string means “use app default (env / branding)”. */
export const craftyWebUrlOverride = ref(loadStored(STORAGE_WEB))

function persist() {
	if (typeof localStorage === 'undefined') return
	if (craftyApiBaseOverride.value) {
		localStorage.setItem(STORAGE_API, craftyApiBaseOverride.value)
	} else {
		localStorage.removeItem(STORAGE_API)
	}
	if (craftyWebUrlOverride.value) {
		localStorage.setItem(STORAGE_WEB, craftyWebUrlOverride.value)
	} else {
		localStorage.removeItem(STORAGE_WEB)
	}
}

/**
 * Saves trimmed overrides. Pass empty strings to clear an override.
 */
export function saveCraftyEndpointOverrides(apiBaseUrl: string, webPanelUrl: string) {
	craftyApiBaseOverride.value = apiBaseUrl ? trimCraftyUrl(apiBaseUrl) : ''
	craftyWebUrlOverride.value = webPanelUrl ? trimCraftyUrl(webPanelUrl) : ''
	persist()
}

export function resetCraftyEndpointOverrides() {
	craftyApiBaseOverride.value = ''
	craftyWebUrlOverride.value = ''
	persist()
}

export function resolvedCraftyApiBase(fallback: string) {
	return computed(() => craftyApiBaseOverride.value || trimCraftyUrl(fallback))
}

export function resolvedCraftyWebUrl(fallback: string) {
	return computed(() => craftyWebUrlOverride.value || trimCraftyUrl(fallback))
}
