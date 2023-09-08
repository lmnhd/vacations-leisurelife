const LandingLayout = ({ children }: { children: React.ReactNode }) => {
  return <main className="h-full ">
    <div className="w-full h-[900px]? overflow-hidden?  mx-auto">
        {children}
    </div>
    </main>;
};

export default LandingLayout;
