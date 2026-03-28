import CBDestinationPicksTiles from "./cb/cbdestinationpickstile";
const shouldRenderLiveDestinationTiles =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_CB_DESTINATION_TILES_IN_PRODUCTION === "true";

export const LandingContent = async () => {
  if (!shouldRenderLiveDestinationTiles) {
    return (
      <section className="relative overflow-hidden px-6 py-12">
        <div className="relative space-y-4 rounded-[32px] border border-white/10 bg-slate-950/70 px-8 py-10 text-white shadow-xl">
          <p className="text-[10px] uppercase tracking-[0.7em] text-cyan-300">Featured Cruise Picks</p>
          <h2 className="text-3xl font-semibold">Hand-picked destination deals are available inside search.</h2>
          <p className="max-w-3xl text-sm text-slate-300 md:text-base">
            Live CB destination tiles are disabled for production requests by default so the homepage stays fast and reliable on Vercel.
          </p>
        </div>
      </section>
    );
  }

  return (
  <>

     <div 
     //className="bg-primary/50 hover:bg-gradient-to-br hover:from-lime-400/70 hover:via-lime-500  hover:to-lime-400/70"
     //className="px-10 pb-20 bg-primary hover:bg-gradient-to-r hover:from-primary-foreground/70 hover:via-primary/70 hover:to-primary-foreground/70 transition-all ease-in-out duration-500 "
     >
      <CBDestinationPicksTiles/>
       
     </div>
    </>
  );
};
