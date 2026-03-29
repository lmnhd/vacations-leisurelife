import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
    title: 'Privacy Policy | Leisure Life Interactive',
    description: 'Privacy policy for Leisure Life Interactive.',
};

export default function PrivacyPage() {
    return (
        <LegalPage
            eyebrow="Legal"
            title="Privacy Policy"
            intro="This policy explains what information Leisure Life Interactive collects, why it is collected, and how to request help or changes related to your personal data."
            updatedAt="March 29, 2026"
            sections={[
                {
                    heading: 'Information We Collect',
                    body: [
                        'We may collect information you choose to submit through our site, including your name, email address, phone number, travel interests, booking preferences, and campaign waitlist responses.',
                        'We may also collect technical information such as browser type, device information, referring pages, and basic analytics data needed to operate, secure, and improve the site.',
                    ],
                },
                {
                    heading: 'How We Use Information',
                    body: [
                        'We use submitted information to respond to inquiries, manage travel leads, support group campaign planning, deliver requested updates, and improve the quality of our booking and campaign experiences.',
                        'We may also use business contact information to follow up about requested services, eligibility, booking flow progress, or campaign participation.',
                    ],
                },
                {
                    heading: 'Sharing And Storage',
                    body: [
                        'We do not sell personal information. We may use service providers that help us operate the site and related services, such as hosting, analytics, communications, payments, and customer support tooling.',
                        'Information is stored only as long as reasonably needed for business, legal, operational, or security purposes.',
                    ],
                },
                {
                    heading: 'Your Choices',
                    body: [
                        'You may request access, correction, or deletion of the personal information you have submitted to us by contacting us directly.',
                        'You may also opt out of non-essential follow-up communications by replying to the message you received or emailing us with your request.',
                    ],
                },
                {
                    heading: 'Contact',
                    body: [
                        'For privacy questions or requests, contact Leisure Life Interactive at leisurelifeinteractive@gmail.com.',
                    ],
                },
            ]}
        />
    );
}