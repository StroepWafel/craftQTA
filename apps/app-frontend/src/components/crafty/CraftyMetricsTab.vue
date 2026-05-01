<script setup lang="ts">
import {
	craftyHistoryChartPayload,
	craftyMetricLooksPercent,
	craftyUnpackHistoryEnvelope,
} from '@/helpers/crafty-history'

import { Chart } from '@modrinth/ui'
import { injectModrinthClient } from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
	serverId: string
	craftyApiCacheKey: string
	craftyJwtKey: string
}>()

const { t, te } = useI18n()
const client = injectModrinthClient()

const histQuery = useQuery({
	queryKey: computed(() => [
		'crafty',
		'history',
		props.serverId,
		props.craftyJwtKey,
		props.craftyApiCacheKey,
	]),
	queryFn: async () => client.crafty.v2.getServerHistory(props.serverId) as Promise<Record<string, unknown>>,
	enabled: computed(() => Boolean(props.serverId && props.craftyJwtKey)),
	refetchInterval: 20000,
	staleTime: 10000,
})

const prettified = computed(() => JSON.stringify(histQuery.data.value ?? {}, null, 2))

const chartPayload = computed(() =>
	craftyHistoryChartPayload(craftyUnpackHistoryEnvelope(histQuery.data.value)),
)

/** `@modrinth/ui` Chart binds Apex options once; remount when the query refreshes. */
const chartGen = ref(0)
watch(
	() => [histQuery.dataUpdatedAt.value, chartPayload.value.sampleCount],
	() => {
		chartGen.value++
	},
)

function metricTitle(metricKey: string): string {
	const i18nKey = `app.crafty-servers.metrics-series.${metricKey}`
	return te(i18nKey) ? t(i18nKey) : metricKey.replace(/_/g, ' ')
}

function metricSuffix(metricKey: string): string {
	if (metricKey === 'memory_gb') return t('app.crafty-servers.metrics-suffix-gb')
	return craftyMetricLooksPercent(metricKey) ? '%' : ''
}

function metricChartColors(metricKey: string): string[] {
	switch (metricKey) {
		case 'players':
			return ['var(--color-brand)']
		case 'memory_gb':
			return ['var(--color-blue)']
		case 'cpu_percent':
			return ['var(--color-orange)']
		case 'mem_percent':
			return ['var(--color-purple)']
		default:
			return ['var(--color-purple)']
	}
}

function metricCardAccentClass(metricKey: string): string {
	switch (metricKey) {
		case 'players':
			return '!border-l-4 border-l-brand'
		case 'memory_gb':
			return '!border-l-4 border-l-blue'
		case 'cpu_percent':
			return '!border-l-4 border-l-orange'
		case 'mem_percent':
			return '!border-l-4 border-l-purple'
		default:
			return '!border-l-4 border-l-purple'
	}
}

function formatQueryUnknownError(e: unknown): string {
	if (e instanceof Error) return e.message
	if (typeof e === 'object' && e !== null) {
		const m = (e as { message?: unknown }).message
		if (typeof m === 'string' && m.trim()) return m
		try {
			return JSON.stringify(e)
		} catch {
			return String(e)
		}
	}
	return typeof e === 'string' ? e : String(e)
}
</script>

<template>
	<div class="flex flex-col gap-5">
		<p class="m-0 text-sm text-secondary">{{ t('app.crafty-servers.metrics-intro') }}</p>

		<p v-if="histQuery.isPending.value" class="m-0 text-sm text-secondary">
			{{ t('app.crafty-servers.loading-history') }}
		</p>
		<p
			v-else-if="histQuery.isError.value"
			class="m-0 rounded-xl border border-orange bg-bg-orange px-3 py-2 text-sm text-primary"
		>
			{{ formatQueryUnknownError(histQuery.error.value) }}
		</p>

		<template v-else>
			<section
				v-if="chartPayload.hasRenderableChart"
				class="grid grid-cols-1 gap-5 lg:grid-cols-2"
			>
				<div
					v-for="s in chartPayload.series"
					:key="`${chartGen}-${serverId}-${s.metricKey}`"
					class="flex min-h-[300px] flex-col gap-2 rounded-2xl border border-solid border-divider bg-bg-raised px-5 pb-3 pt-4"
					:class="metricCardAccentClass(s.metricKey)"
				>
					<h3
						class="m-0 text-xs font-semibold uppercase tracking-wide"
						:class="{
							'text-brand': s.metricKey === 'players',
							'text-blue': s.metricKey === 'memory_gb',
							'text-orange': s.metricKey === 'cpu_percent',
							'text-purple': s.metricKey === 'mem_percent',
						}"
					>
						{{ metricTitle(s.metricKey) }}
					</h3>
					<div class="min-h-[228px] flex-1 [&_.apexcharts-svg]:rounded-lg [&_.apexcharts-tooltip]:rounded-lg">
						<Chart
							:name="`crafty-metrics-${serverId}-${s.metricKey}`"
							:labels="chartPayload.labelsMs"
							type="area"
							:data="[{ name: metricTitle(s.metricKey), data: s.data }]"
							:colors="metricChartColors(s.metricKey)"
							:hide-toolbar="true"
							:hide-legend="true"
							class="[&_.apexcharts-canvas]:min-h-[208px]"
						>
						</Chart>
						<p
							v-if="metricSuffix(s.metricKey)"
							class="m-0 text-right text-[10px] uppercase tracking-wide text-secondary opacity-75"
						>
							{{ metricSuffix(s.metricKey) }}
						</p>
					</div>
				</div>
			</section>

			<p
				v-else
				class="m-0 rounded-2xl border border-divider bg-bg-raised px-4 py-6 text-center text-sm text-secondary"
			>
				{{ t('app.crafty-servers.metrics-chart-empty') }}
			</p>
		</template>

		<details class="rounded-2xl border border-divider bg-bg-raised p-4">
			<summary class="cursor-pointer font-semibold">{{ t('app.crafty-servers.raw-json') }}</summary>
			<pre class="max-h-[min(40vh,360px)] overflow-auto text-xs">{{ prettified }}</pre>
		</details>
	</div>
</template>
