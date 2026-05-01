import type { AbstractFeature } from '../core/abstract-feature'
import type { RequestContext } from './request'

/**
 * Request lifecycle hooks
 */
export type RequestHooks = {
	/**
	 * Called before request is sent (after all features have processed)
	 */
	onRequest?: (context: RequestContext) => void | Promise<void>

	/**
	 * Called after successful response (before features process response)
	 */
	onResponse?: <T>(data: T, context: RequestContext) => void | Promise<void>

	/**
	 * Called when request fails (after all features have processed error)
	 */
	onError?: (error: Error, context: RequestContext) => void | Promise<void>
}

/**
 * Client configuration
 */
export interface ClientConfig {
	/**
	 * User agent string for requests
	 * Should identify your application (e.g., 'my-app/1.0.0')
	 * If not provided, the platform's default user agent will be used
	 */
	userAgent?: string

	/**
	 * Base URL for Labrinth API (main Modrinth API)
	 * @default 'https://api.modrinth.com'
	 */
	labrinthBaseUrl?: string

	/**
	 * Base URL for Archon API (Modrinth Hosting API)
	 * @default 'https://archon.modrinth.com'
	 */
	archonBaseUrl?: string

	/**
	 * Default request timeout in milliseconds
	 * @default 10000
	 */
	timeout?: number

	/**
	 * Additional default headers to include in all requests
	 */
	headers?: Record<string, string>

	/**
	 * Whether to attach `modrinth-sentry-capture: 1` to Archon requests.
	 * Can be a callback so apps can drive this from runtime feature flags.
	 *
	 * @default false
	 */
	archonSentryCapture?: boolean | (() => boolean)

	/**
	 * Crafty Controller API origin (no trailing slash). Requests use `{craftyBaseUrl}/api/v2/...`.
	 */
	craftyBaseUrl?: string

	/**
	 * Bearer token for Crafty (`Bearer …`). Usually reads from app storage each request.
	 */
	getCraftyAuthorization?: () =>
		| string
		| undefined
		| Promise<string | undefined>

	/**
	 * Features to enable for this client
	 * Features are applied in the order they appear in this array
	 */
	features?: AbstractFeature[]

	/**
	 * Request lifecycle hooks
	 */
	hooks?: RequestHooks
}
