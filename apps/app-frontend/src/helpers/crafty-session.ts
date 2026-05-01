import { ref } from 'vue'

export const CRAFTY_JWT_STORAGE_KEY = 'craftqta.crafty.jwt'

/** Reactive Crafty JWT (also persisted under {@link CRAFTY_JWT_STORAGE_KEY}). */
export const craftyJwt = ref<string | null>(
	typeof localStorage !== 'undefined' ? localStorage.getItem(CRAFTY_JWT_STORAGE_KEY) : null,
)

export function setCraftyJwt(token: string | null) {
	craftyJwt.value = token
	if (typeof localStorage === 'undefined') {
		return
	}
	if (token) {
		localStorage.setItem(CRAFTY_JWT_STORAGE_KEY, token)
	} else {
		localStorage.removeItem(CRAFTY_JWT_STORAGE_KEY)
	}
}
