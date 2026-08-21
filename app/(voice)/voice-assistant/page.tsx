import type { Metadata } from 'next';

import { VoiceAssistantExperience } from './voice-assistant-experience';

export const metadata: Metadata = {
  title: 'Cruise Concierge - Leisure Life Interactive',
  description:
    'A live voice AI cruise concierge: speech-to-speech discovery, comparison, preference memory, and a demonstrated booking flow with real safety boundaries.',
};

export const dynamic = 'force-dynamic';

export default function VoiceAssistantPage() {
  const telephoneNumber =
    process.env.NEXT_PUBLIC_VOICE_ASSISTANT_PHONE?.trim() || '+18557995436';

  return <VoiceAssistantExperience telephoneNumber={telephoneNumber} />;
}
