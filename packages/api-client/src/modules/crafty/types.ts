/** Crafty Controller HTTP JSON API v2 — shapes mirror upstream docs where possible; extras tolerated via index signatures. */
export namespace Crafty {
	export namespace Auth {
		export namespace v2 {
			export type LoginBody = {
				username: string
				password: string
				totp?: string
				backup_code?: string
			}

			export type LoginResponse = {
				status: string
				data?: {
					token: string
					user_id: string
					page?: string
				}
				error?: string
				error_data?: string
			}
		}
	}

	export namespace Servers {
		export namespace v2 {
			export type Server = {
				server_id?: string
				server_uuid?: string
				server_name?: string
				server_ip?: string
				server_port?: number
				executable?: string
				path?: string
				auto_start?: boolean
				auto_start_delay?: number
				type?: string
				execution_command?: string
				log_path?: string
				stop_command?: string
				[key: string]: unknown
			}

			export type ListResponse = {
				status: string
				data?: Server[]
				error?: string
				error_data?: string
			}

			export type GetResponse = {
				status: string
				data?: Server
				error?: string
				error_data?: string
			}
		}
	}

	export namespace v2 {
		export type StatusOK = {
			status: string
			error?: string
			error_data?: string
		}

		export type LogsResponse = {
			status: string
			data?: string[]
			error?: string
			error_data?: string
		}

		export type NewClonedServerResponse = {
			status: string
			data?: {
				new_server_id?: string
				new_server_uuid?: string
			}
			error?: string
			error_data?: string
		}

		export type ServerStats = Record<string, unknown>

		export type StatsResponse = {
			status: string
			data?: ServerStats
			error?: string
			error_data?: string
		}

		export type ServerUsersResponse = {
			status: string
			data?: number[]
			error?: string
			error_data?: string
		}

		export type Webhook = {
			webhook_type?: string
			name?: string
			url?: string
			bot_name?: string
			trigger?: string | string[]
			body?: string
			enabled?: boolean
			[key: string]: unknown
		}

		export type WebhooksListResponse = {
			status: string
			data?: Record<string, Webhook>
			error?: string
			error_data?: string
		}

		export type CreateWebhookBody = {
			webhook_type: string
			name: string
			url: string
			bot_name?: string
			trigger?: string[]
			body?: string
			enabled?: boolean
		}

		export type PatchWebhookBody = {
			webhook_type?: string
			name?: string
			url?: string
			bot_name?: string
			trigger?: string[]
			body?: string
			enabled?: boolean
		}

		export type CreateWebhookResponse = {
			status: string
			data?: { webhook_id?: number }
			error?: string
			error_data?: string
		}

		export type ServerPowerAction =
			| 'clone_server'
			| 'start_server'
			| 'stop_server'
			| 'restart_server'
			| 'kill_server'
			| 'backup_server'
			| 'update_executable'

		/** Loose JSON payloads from `/servers/:id/files` (Crafty MCP + panel variants). */
		export type FilesBrowseBody = {
			path?: string
			cwd?: string
			browse_path?: string
			current_path?: string
		}

		export type FilesUpdateBody = {
			path: string
			contents: string
			overwrite?: boolean
		}

		export type FilesDeleteBody = {
			file_system_objects: { filename: string }[]
		}

		export type FilesCreatePutBody = {
			parent: string
			name: string
			directory: boolean
		}

		export type FilesRenamePatchBody = {
			path: string
			new_name: string
		}

		export type BackupRestoreBody = {
			filename: string
			inPlace?: boolean
		}

		export type TasksResponse<T = Record<string, unknown>> = {
			status: string
			data?: T
			error?: string
			error_data?: string
		}
	}
}
