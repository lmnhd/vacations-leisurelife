import Link from 'next/link';

/**
 * Dark-palette trust footer for /voice-assistant.
 *
 * Content parity with `components/campaign-landing/campaign-trust-footer.tsx`
 * is deliberate and required: the trade name, registered entity, corporate
 * address, contact details, and the four policy links are trust signals that
 * Meta, TikTok, and toll-free carrier reviewers look for. Only the styling
 * differs, so this route does not end in a white slab.
 *
 * If the legal content changes in the shared footer, change it here too.
 */

const INK = '#1A0B2E';
const MAGENTA = '#FF2D95';
const CORAL = '#FF5E3A';
const TANGERINE = '#FFA51F';
const LIME = '#B4FF39';
const CYAN = '#22E4FF';
const VIOLET = '#A855F7';
const BODY = '#C9AEDB';

export function VoiceAssistantFooter() {
  const currentYear = new Date().getFullYear();
  const tollFreePhone = process.env.NEXT_PUBLIC_LLI_TOLL_FREE?.trim();

  return (
    <footer style={{ background: INK, color: BODY }}>
      <div
        aria-hidden
        style={{
          height: 4,
          background: `linear-gradient(90deg, ${VIOLET}, ${CYAN}, ${LIME}, ${TANGERINE}, ${CORAL}, ${MAGENTA})`,
        }}
      />
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="grid gap-2 text-sm leading-7">
            <p
              className="text-[11px] font-black uppercase tracking-[0.24em]"
              style={{ color: CYAN }}
            >
              Leisure Life Interactive
            </p>
            <p>
              &copy; {currentYear} Leisure Life Interactive. All rights reserved. Leisure Life
              Interactive is a registered trade name of HALIMEDE LLC.
            </p>
            <p>Corporate Address: 2280 SHEPARD ST. JACKSONVILLE, FL 32211.</p>
            <p>
              Contact:{' '}
              <a
                href="mailto:nathaniel@leisurelifeinteractive.net"
                className="underline underline-offset-4"
                style={{ color: LIME }}
              >
                nathaniel@leisurelifeinteractive.net
              </a>
              {tollFreePhone ? (
                <>
                  {' '}
                  &middot;{' '}
                  <a
                    href={`tel:${stripToDialable(tollFreePhone)}`}
                    className="underline underline-offset-4"
                    style={{ color: LIME }}
                  >
                    {tollFreePhone}
                  </a>
                </>
              ) : null}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm md:justify-end">
            <FooterLink href="/privacy" color={CYAN}>
              Privacy Policy
            </FooterLink>
            <FooterLink href="/terms" color={TANGERINE}>
              Terms of Service
            </FooterLink>
            <FooterLink href="/sms-consent" color={MAGENTA}>
              SMS Consent
            </FooterLink>
            <FooterLink href="/data-deletion" color={VIOLET}>
              Data Deletion
            </FooterLink>
          </nav>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  color,
  children,
}: {
  href: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-bold underline underline-offset-4"
      style={{ color }}
    >
      {children}
    </Link>
  );
}

/**
 * Keeps digits and a leading plus for the tel: href.
 * Written as a character scan rather than a pattern because AI_POLICY.md
 * forbids regex in application code.
 */
function stripToDialable(value: string): string {
  let dialable = '';
  for (const character of value) {
    if (character === '+' && dialable.length === 0) {
      dialable += character;
      continue;
    }
    if (character >= '0' && character <= '9') dialable += character;
  }
  return dialable;
}
