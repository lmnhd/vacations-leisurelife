import "@/app/(landing)/landing.css";
const LandingLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="bg-gradient-to-b from-black via-black to-red-700">
      
        {children}
      
    </main>
  );
};

export default LandingLayout;
