import type { HostingMarketingContext } from '@modrinth/ui'

import { branding } from '@/branding'

/** Injected into `@modrinth/ui` so hosting-related marketing stays fork-specific without changing web defaults. */
export const hostingMarketingContext: HostingMarketingContext = {
	serverListEmpty: {
		headline: `${branding.productNameShort} Servers`,
		description: `Manage Minecraft servers through Crafty Controller—power actions and logs from ${branding.productNameShort}.`,
		featureOneTitle: 'Remote control',
		featureOneDescription: 'Start, stop, and restart servers via Crafty API.',
		featureTwoTitle: 'Console output',
		featureTwoDescription: 'Inspect recent logs without leaving the app.',
		featureThreeTitle: 'Full Crafty UI',
		featureThreeDescription: `Advanced configuration stays in the Crafty panel (${branding.craftyWebUrl}).`,
		newServerButtonLabel: 'Open Crafty',
		learnMoreLabel: 'Open Crafty Controller',
		learnMoreHref: branding.craftyWebUrl,
		alreadyHaveServerLabel: 'Use Crafty credentials?',
		signInButtonLabel: 'Sign in',
	},
	onboarding: {
		welcomeTitle: `Welcome to ${branding.productNameShort} Servers`,
		welcomeDescription:
			"Your server is ready. Here's what you need to do to start playing!",
	},
}
