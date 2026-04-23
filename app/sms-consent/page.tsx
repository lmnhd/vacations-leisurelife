import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
    title: 'SMS Consent | Leisure Life Interactive',
    description: 'Explains how users opt in to campaign SMS alerts from Leisure Life Interactive.',
};

export default function SmsConsentPage() {
    return (
        <LegalPage
            eyebrow="Legal"
            title="SMS Consent"
            intro="This page explains the exact consent flow used for Leisure Life Interactive campaign text alerts. It is intended to serve as the stable public proof-of-consent reference for messaging providers and compliance reviews."
            updatedAt="April 11, 2026"
            sections={[
                {
                    heading: 'How Users Opt In',
                    imageUrl: '/images/legal/sms-opt-in-proof.png',
                    imageAlt: 'Screenshot of the campaign waitlist SMS opt-in form showing the phone field, unchecked consent box, disclosure language, and links to privacy policy and terms of service.',
                    body: [
                        'Users join a specific cruise campaign waitlist on the Leisure Life Interactive website. On that waitlist form, providing a mobile number is optional.',
                        'If a user enters a mobile number, they must also explicitly check the SMS consent box before the form can be submitted with that number.',
                        'The consent language states that by providing a mobile number, the user agrees to receive variable informational SMS alerts about the selected cruise campaign, including threshold and next-step updates. The form also states that message and data rates may apply and that users can reply STOP to opt out and HELP for help.',
                    ],
                },
                {
                    heading: 'What Messages Are Sent',
                    body: [
                        'SMS messages are used only for campaign-related updates such as threshold alerts, booking-readiness updates, and other limited status notifications tied to the cruise campaign the user selected.',
                        'Users who do not provide a mobile number do not receive SMS messages. SMS consent is optional and is not required to join a campaign waitlist.',
                    ],
                },
                {
                    heading: 'Representative Consent Language',
                    body: [
                        'By providing a mobile number, you agree to receive variable informational SMS alerts from Leisure Life Interactive about this selected cruise campaign, including threshold and next-step updates. Message and data rates may apply. Reply STOP to opt out and HELP for help.',
                        'The waitlist form also links directly to the Privacy Policy and Terms of Service pages so users can review the SMS program terms before consenting.',
                    ],
                },
                {
                    heading: 'Policy Links',
                    body: [
                        'Privacy Policy: https://leisurelifeinteractive.net/privacy',
                        'Terms of Service: https://leisurelifeinteractive.net/terms',
                    ],
                },
            ]}
        />
    );
}