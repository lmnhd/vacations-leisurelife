import { CampaignTrustFooter } from '@/components/campaign-landing/campaign-trust-footer';

const LandingLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto w-full flex-1">{children}</div>
      <CampaignTrustFooter />
    </main>
  );
};

export default LandingLayout;
