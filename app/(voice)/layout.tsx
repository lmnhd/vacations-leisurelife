/**
 * Layout for the `(voice)` route group.
 *
 * `/voice-assistant` deliberately sits OUTSIDE the `(landing)` group. That
 * group's layout appends `CampaignTrustFooter`, which is hardcoded `bg-white`
 * and is shared with the deals and groups pages. Nesting a layout inside
 * `(landing)` would not replace that footer - Next.js composes nested
 * layouts, so both would render. Route groups do not affect the URL, so the
 * public path is still `/voice-assistant`.
 *
 * This group renders its own dark-palette footer carrying the identical legal
 * content: trade name, registered entity, corporate address, contact, and the
 * four policy links that ad and carrier reviewers crawl for.
 */

import { VoiceAssistantFooter } from './voice-assistant-footer';

export default function VoiceRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full flex-1">{children}</div>
      <VoiceAssistantFooter />
    </main>
  );
}
