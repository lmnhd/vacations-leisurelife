const LandingLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="h-full ">
      <div
        //className=" bg-slate-800  mx-auto text-white"
        //className="flex flex-col items-center justify-center w-full h-[900px]? overflow-hidden? h-screen"
      >
        {children}
      </div>
    </main>
  );
};

export default LandingLayout;
