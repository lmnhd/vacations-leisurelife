const LandingLayout = ({ children }: { children: React.ReactNode }) => {
  return <main className="h-full bg-primary">
    <div className="w-full h-full max-w-screen-xl mx-auto">
        {children}
    </div>
    </main>;
};

export default LandingLayout;
