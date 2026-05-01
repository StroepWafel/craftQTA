import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

/** Overrides for the empty-server marketing panel (`ServerListEmpty`). Omitted keys fall back to i18n defaults. */
export type HostingServerListEmptyOverrides = Partial<{
	headline: string
	description: string
	featureOneTitle: string
	featureOneDescription: string
	featureTwoTitle: string
	featureTwoDescription: string
	featureThreeTitle: string
	featureThreeDescription: string
	newServerButtonLabel: string
	learnMoreLabel: string
	learnMoreHref: string
	hideLearnMore: boolean
	alreadyHaveServerLabel: string
	signInButtonLabel: string
}>

export type HostingOnboardingOverrides = Partial<{
	welcomeTitle: string
	welcomeDescription: string
}>

export type HostingMarketingContext = {
	serverListEmpty?: HostingServerListEmptyOverrides
	onboarding?: HostingOnboardingOverrides
}

const hostingMarketingKey: InjectionKey<HostingMarketingContext | undefined> = Symbol('hostingMarketing')

export function provideHostingMarketing(ctx: HostingMarketingContext) {
	provide(hostingMarketingKey, ctx)
}

export function injectHostingMarketing(): HostingMarketingContext | undefined {
	return inject(hostingMarketingKey, undefined)
}
