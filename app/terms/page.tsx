import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
    title: 'Terms of Service | Leisure Life Interactive',
    description: 'Terms of service for Leisure Life Interactive.',
};

export default function TermsPage() {
    return (
        <LegalPage
            eyebrow="Legal"
            title="Terms of Service"
            intro="These terms describe the basic rules for using the Leisure Life Interactive website, content, travel inquiry forms, and campaign-related experiences."
            updatedAt="March 29, 2026"
            sections={[
                {
                    heading: 'Use Of The Site',
                    body: [
                        'By using this site, you agree to use it lawfully and only for legitimate travel, booking, campaign, or business inquiry purposes.',
                        'You may not use the site to interfere with operations, submit false information, or misuse any forms, APIs, or interactive features.',
                    ],
                },
                {
                    heading: 'Information And Availability',
                    body: [
                        'Travel offers, campaign availability, pricing, and group thresholds may change over time. Site content is provided for general informational and commercial use and may be updated without notice.',
                        'We do not guarantee that every route, campaign, offer, or travel package shown on the site will remain available.',
                    ],
                },
                {
                    heading: 'Bookings And Third-Party Services',
                    body: [
                        'Some services may involve third-party providers, booking engines, payment processors, or communications tools. Their own terms, privacy practices, and operational rules may also apply.',
                        'Where a third-party supplier or cruise operator controls pricing, inventory, or final booking confirmation, those provider rules govern the final transaction.',
                    ],
                },
                {
                    heading: 'SMS Program Terms',
                    body: [
                        'Leisure Life Interactive Campaign SMS Alerts is an optional informational messaging program for users who choose to provide a mobile number on a campaign landing page and consent to receive text alerts related to that selected cruise campaign.',
                        'Message frequency varies. Messages may include threshold alerts, booking-readiness updates, or other requested campaign status notifications. Message and data rates may apply.',
                        'For help, reply HELP or contact nathaniel@leisurelifeinteractive.net. To stop receiving messages, reply STOP at any time.',
                    ],
                },
                {
                    heading: 'No Warranty',
                    body: [
                        'The site and its contents are provided on an as-is and as-available basis without warranties of uninterrupted availability, accuracy, or fitness for a particular purpose.',
                    ],
                },
                {
                    heading: 'Contact',
                    body: [
                        'Questions about these terms may be directed to nathaniel@leisurelifeinteractive.net.',
                    ],
                },
            ]}
        />
    );
}