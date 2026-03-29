import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = {
    title: 'Data Deletion | Leisure Life Interactive',
    description: 'Data deletion instructions for Leisure Life Interactive.',
};

export default function DataDeletionPage() {
    return (
        <LegalPage
            eyebrow="Support"
            title="Data Deletion Instructions"
            intro="If you want Leisure Life Interactive to delete personal information you previously submitted, use the process below and we will review the request."
            updatedAt="March 29, 2026"
            sections={[
                {
                    heading: 'How To Request Deletion',
                    body: [
                        'Send an email to leisurelifeinteractive@gmail.com with the subject line Data Deletion Request.',
                        'Include the name, email address, phone number, or other contact details you used when interacting with us so we can identify the relevant records.',
                    ],
                },
                {
                    heading: 'How We Process Requests',
                    body: [
                        'We will review the request, verify that it came from the relevant person or an authorized representative, and then delete or anonymize personal information where reasonably possible.',
                        'We may retain limited information where required for security, legal compliance, dispute handling, fraud prevention, or recordkeeping obligations.',
                    ],
                },
                {
                    heading: 'Response Timing',
                    body: [
                        'We aim to respond to deletion requests within a reasonable period after receiving enough information to identify the records involved.',
                    ],
                },
                {
                    heading: 'Contact',
                    body: [
                        'For deletion requests or questions about this process, contact leisurelifeinteractive@gmail.com.',
                    ],
                },
            ]}
        />
    );
}