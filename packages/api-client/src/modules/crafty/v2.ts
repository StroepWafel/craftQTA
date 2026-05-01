import { AbstractModule } from '../../core/abstract-module'
import type { RequestOptions } from '../../types/request'
import type { Crafty } from './types'

export type CraftyV2TasksRequestOverrides = Pick<RequestOptions, 'timeout' | 'signal' | 'retry'>

/**
 * Crafty Controller REST API v2 (JWT Bearer).
 * Base URL must reach `/api/v2/*` (e.g. pass {@link ClientConfig.craftyBaseUrl} without trailing slash).
 */
export class CraftyV2Module extends AbstractModule {
	public getModuleID(): string {
		return 'crafty_v2'
	}

	private baseUrl(): string {
		const raw =
			this.client.config.craftyBaseUrl ??
			'https://crafty.stroepwafel.au'
		return raw.replace(/\/$/, '')
	}

	private async authHeaders(): Promise<Record<string, string>> {
		const authorization = await Promise.resolve(
			this.client.config.getCraftyAuthorization?.(),
		)
		const headers: Record<string, string> = {}
		if (authorization) {
			headers.Authorization = authorization
		}

		return headers
	}

	public async login(
		body: Crafty.Auth.v2.LoginBody,
	): Promise<Crafty.Auth.v2.LoginResponse> {
		return this.client.request<Crafty.Auth.v2.LoginResponse>('/auth/login', {
			api: this.baseUrl(),
			version: 'api/v2',
			method: 'POST',
			body,
			skipAuth: true,
		})
	}

	public async invalidateTokens(): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>('/auth/invalidate_tokens', {
			api: this.baseUrl(),
			version: 'api/v2',
			method: 'POST',
			skipAuth: true,
			headers: await this.authHeaders(),
		})
	}

	public async listServers(): Promise<Crafty.Servers.v2.ListResponse> {
		return this.client.request<Crafty.Servers.v2.ListResponse>('/servers', {
			api: this.baseUrl(),
			version: 'api/v2',
			method: 'GET',
			skipAuth: true,
			headers: await this.authHeaders(),
		})
	}

	public async getServer(serverId: string): Promise<Crafty.Servers.v2.GetResponse> {
		return this.client.request<Crafty.Servers.v2.GetResponse>(
			`/servers/${encodeURIComponent(serverId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async patchServer(serverId: string, body: Record<string, unknown>): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PATCH',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async deleteServer(serverId: string): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'DELETE',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async getStats(serverId: string): Promise<Crafty.v2.StatsResponse> {
		return this.client.request<Crafty.v2.StatsResponse>(
			`/servers/${encodeURIComponent(serverId)}/stats`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async getServerUsers(serverId: string): Promise<Crafty.v2.ServerUsersResponse> {
		return this.client.request<Crafty.v2.ServerUsersResponse>(
			`/servers/${encodeURIComponent(serverId)}/users`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async serverAction(
		serverId: string,
		action: Crafty.v2.ServerPowerAction,
	): Promise<Crafty.v2.StatusOK | Crafty.v2.NewClonedServerResponse> {
		return this.client.request<Crafty.v2.StatusOK | Crafty.v2.NewClonedServerResponse>(
			`/servers/${encodeURIComponent(serverId)}/action/${encodeURIComponent(action)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async getLogs(
		serverId: string,
		params?: { file?: boolean; raw?: boolean; colors?: boolean; html?: boolean },
	): Promise<Crafty.v2.LogsResponse> {
		return this.client.request<Crafty.v2.LogsResponse>(
			`/servers/${encodeURIComponent(serverId)}/logs`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
				params: params as Record<string, unknown> | undefined,
			},
		)
	}

	public async sendStdin(serverId: string, command: string): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/stdin`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body: command,
				skipAuth: true,
				headers: {
					...(await this.authHeaders()),
					'Content-Type': 'text/plain',
				},
			},
		)
	}

	public async listWebhooks(serverId: string): Promise<Crafty.v2.WebhooksListResponse> {
		return this.client.request<Crafty.v2.WebhooksListResponse>(
			`/servers/${encodeURIComponent(serverId)}/webhook`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async createWebhook(
		serverId: string,
		body: Crafty.v2.CreateWebhookBody,
	): Promise<Crafty.v2.CreateWebhookResponse> {
		return this.client.request<Crafty.v2.CreateWebhookResponse>(
			`/servers/${encodeURIComponent(serverId)}/webhook`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async patchWebhook(
		serverId: string,
		webhookId: number,
		body: Crafty.v2.PatchWebhookBody,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/webhook/${encodeURIComponent(String(webhookId))}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PATCH',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async deleteWebhook(serverId: string, webhookId: number): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/webhook/${encodeURIComponent(String(webhookId))}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'DELETE',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	/** List directory or inspect path — Crafty MCP uses POST `{ path }`. */
	public async browseServerFiles(
		serverId: string,
		body: Crafty.v2.FilesBrowseBody,
	): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/files`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	/** Some Crafty builds expose listing at `POST …/files/list` only. Same body shape as browse. */
	public async browseServerFilesList(
		serverId: string,
		body: Crafty.v2.FilesBrowseBody,
	): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/files/list`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async updateServerFile(
		serverId: string,
		body: Crafty.v2.FilesUpdateBody,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/files`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PATCH',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async deleteServerFilePaths(serverId: string, paths: string[]): Promise<Crafty.v2.StatusOK> {
		const body: Crafty.v2.FilesDeleteBody = {
			file_system_objects: paths.map((filename) => ({ filename })),
		}
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/files`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'DELETE',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async createServerFileEntry(
		serverId: string,
		body: Crafty.v2.FilesCreatePutBody,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/files/create`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PUT',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async renameServerFileEntry(
		serverId: string,
		body: Crafty.v2.FilesRenamePatchBody,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/files/create`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PATCH',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async decompressServerArchive(serverId: string, folder: string): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/files/zip`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body: { folder },
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async listServerBackups(serverId: string): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/backups`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async getBackupConfig(serverId: string): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/backups/config`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async patchBackupConfig(
		serverId: string,
		body: Record<string, unknown>,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/backups/config`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PATCH',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async restoreServerBackup(
		serverId: string,
		backupId: string,
		body: Crafty.v2.BackupRestoreBody,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/backups/backup/${encodeURIComponent(backupId)}/restore`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async deleteServerBackup(serverId: string, backupId: string): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/backups/backup/${encodeURIComponent(backupId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'DELETE',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async listServerTasks(
		serverId: string,
		opts?: CraftyV2TasksRequestOverrides,
	): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/tasks`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
				...opts,
			},
		)
	}

	public async getServerTask(
		serverId: string,
		taskId: string,
		opts?: CraftyV2TasksRequestOverrides,
	): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/tasks/${encodeURIComponent(taskId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
				...opts,
			},
		)
	}

	public async createServerTask(serverId: string, body: Record<string, unknown>): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/tasks`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async patchServerTask(
		serverId: string,
		taskId: string,
		body: Record<string, unknown>,
	): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/tasks/${encodeURIComponent(taskId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'PATCH',
				body,
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async deleteServerTask(serverId: string, taskId: string): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/tasks/${encodeURIComponent(taskId)}`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'DELETE',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async runServerTask(serverId: string, taskId: string): Promise<Crafty.v2.StatusOK> {
		return this.client.request<Crafty.v2.StatusOK>(
			`/servers/${encodeURIComponent(serverId)}/tasks/${encodeURIComponent(taskId)}/run`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'POST',
				body: {},
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async listServerTaskChildren(serverId: string, taskId: string): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/tasks/${encodeURIComponent(taskId)}/children`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	public async getServerHistory(serverId: string): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(
			`/servers/${encodeURIComponent(serverId)}/history`,
			{
				api: this.baseUrl(),
				version: 'api/v2',
				method: 'GET',
				skipAuth: true,
				headers: await this.authHeaders(),
			},
		)
	}

	/** Aggregate server status snapshot (Crafty exposes batch endpoint). */
	public async listServersStatus(): Promise<Record<string, unknown>> {
		return this.client.request<Record<string, unknown>>(`/servers/status`, {
			api: this.baseUrl(),
			version: 'api/v2',
			method: 'GET',
			skipAuth: true,
			headers: await this.authHeaders(),
		})
	}
}
