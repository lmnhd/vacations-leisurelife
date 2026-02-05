import React from "react";
import pexelmachine from "@/app/utils/CommonObjects/pexelmachine";
import {
  cbPicks,
  pickID,
} from "@/app/(dashboard)/(routes)/destinationdeal/[id]/index";
import PromotionTile, { PromotionTileProps } from "../promotion-tile";
import { client } from "@gradio/client";
import { aiAssistBackOff } from "@/app/utils/api";
import { Container1Header } from "../containers/container1";

const componentId = "cbDestinationPicksTiles";
const cbpickTestData = {
  img: "https://www.cruisebrothers.com/media/images/destinations/alaska/glacierbay.jpg",
  destination: "Destination: Alaska",
  what: "What: 7-nights Discovery Princess",
  when: "When: June 1, 8, 15, 2024 (weekly departures)",
  price: "Prices: inside from $1,578, balconies from $2,218 per person",
  elsepay:
    "What else you will have to pay: rate includes port charges. Government tax and air additional.",
  go: "Where you go:  round-trip Seattle to Skagway, Ketchikan, Juneau, Glacier Bay viewing and Victoria BC.",
  why: "Why this is a deal:  Plan now, pick your cabin, onboard extras FREE!",
  other:
    "Other details: Alaska early savings for 2024! Reserve today and receive prepaid gratuities, beverage package, WIFI and onboard credit on select dates. Sail along the inside passage and experience the great villages of the Gold Rush. Onboard Alaska naturalist along with Princess hospitality, fine dining and piazza shows. ALSO AVAILABLE Cruise Tour exclusive on Sapphire Princess, 4-nights land, 7-night cruise. Ask us all about it!  800.827.7779.",
};

export interface CBPickData {
  img: string;
  destination: string;
  what: string;
  when: string;
  price: string;
  elsepay: string;
  go: string;
  why: string;
  other: string;
  id: string;
}
export interface sortedDestination {
  destination: string;
  picks: CBPickData[];
  count: number;
}
export default async function CBDestinationPicksTiles() {
  console.log("CB Destination Picks Tiles")
  const __destinationPicks: CBPickData[] = await cbPicks();

   console.log('__destinationPicks',__destinationPicks);
   //return <></>

  const sortedDestinations: sortedDestination[] =
    sortByDestination(__destinationPicks);
  console.log(sortedDestinations.length, sortedDestinations);

  function sortByDestination(picks: CBPickData[]) {
    const foundDestinations: string[] = [];
    const result: sortedDestination[] = [];
    picks.forEach((pick, index) => {
      pick.id = pickID(pick);
      const testdest: string = pick.destination
        .replace("Destination:", "")
        .split(" - ")[0]
        .trim();
      if (!foundDestinations.includes(testdest)) {
        foundDestinations.push(testdest);
        const picks = [];
        picks.push(pick);
        result.push({
          destination: testdest,
          picks: picks,
          count: 1,
        });
      } else {
        const dest = result.find(
          (dest1: sortedDestination) => dest1.destination === testdest
        );
        if (dest) {
          //console.log('found dest',dest)
          let newDest = dest;
          newDest.picks.push(pick);
          const count = dest.count;
          newDest.count = count + 1;
          result.splice(result.indexOf(dest), 1, newDest);
        }
      }
    });
    //console.log(foundDestinations);
    return result;
  }
  async function formatPorts(ports: string) {
    const functionId = "formatPorts";
    const instructions =
      "from the following text, which ports are included in this cruise? Make your answer 6 words or less:";

    const response = await aiAssistBackOff(
      instructions,
      ports,
      componentId,
      functionId,
      "",
      true
    );
    return response;
  }
  async function formatDescription(info: string) {
    const functionId = "formatDescription";
    const instructions =
      "summarize the following text in 50 characters or less. Do not make reference to the text and exclude phone numbers and call now statements, just summarize trip.";

    const response = await aiAssistBackOff(
      instructions,
      info,
      componentId,
      functionId,
      "",
      true
    );
    return response || "bad response";
  }
  async function formatPrice(info: string) {
    const functionId = "formatPrice";
    const instructions =
      "tell me the lowest price mentioned in the following text in one word";

    const response = await aiAssistBackOff(
      instructions,
      info,
      componentId,
      functionId,
      "",
      true
    );
    return response;
  }

  async function mapTile(pick: CBPickData) {
    //convert to PromotionTileProps
    const hasOptions: boolean =
      pick.other.includes("onboard credit") ||
      pick.other.includes("dining") ||
      pick.other.includes("beverage") ||
      pick.other.includes("WIFI");
    const promotionTileProps: PromotionTileProps = {
      imageSrc: (
        await pexelmachine(
          3,
          pick.destination.replace("Destination:", "").replace(" ", "") +
            " vacation"
        )
      )[0].srcMedium,
      alt: pick.destination,
      day: pick.when.replace("When:", "").replace(" ", ""),
      port: await formatPorts(
        pick.go.replace("Where you go:", "").replace(" ", "")
      ),
      header1: pick.destination.replace("Destination:", "").replace(" ", ""),
      header2: pick.what.replace("What:", "").replace(" ", ""),
      description: await formatDescription(
        pick.other.replace("Other details:", "").replace(" ", "")
      ),
      price: {
        perPerson:
          (await formatPrice(
            pick.price.replace("Prices:", "").replace(" ", "")
          )) + "(*starting)",
      },
      toolTips: hasOptions
        ? {
            freeDining: pick.other.includes("dining"),
            freeDrinks: pick.other.includes("beverage"),
            freeWifi: pick.other.includes("WIFI"),
            onboardCredits: pick.other.includes("onboard credit"),
          }
        : undefined,
      detailsLink: `/destinationdeal/${pick.id}`,
    };
    return <PromotionTile promotion={promotionTileProps} />;
  }
  async function mapTileData(sortedDests: any[]) {
    return sortedDests.map(async (dest: sortedDestination, index) => {
      return (
        <div
          key={index}
          className="relative flex flex-col items-center gap-4 rounded-[32px] p-4"
        >
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.7em] text-white/90">
            <span className="inline-flex h-1.5 w-12 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500" />
            <span className="text-base font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
              {dest.destination}
            </span>
          </div>
          <div className="relative w-full max-w-[22rem]">
            <div className="pointer-events-none absolute -inset-3 opacity-40 blur-2xl bg-gradient-to-r from-slate-900 via-primary/20 to-slate-900" />
            <div className="relative">
              {await mapTile(dest.picks[0])}
            </div>
          </div>
        </div>
      );
    });
  }
  // const test = await mapTile(cbpickTestData)
  //  console.log(test.props.promotion.price.perPerson)
  //  console.log(test)
  //  const photos:any = await pexelmachine(6,'australian vacation')
  //  console.log(photos)
  //  promotionsTest.forEach((promotion,index) => {
  //    //console.log(photos.photos[index])
  //    promotion.imageSrc = photos.photos[index].src.medium
  //  })

  //console.log(promotionsTest)
  //mapTileData(sortedDestinations)
  //await formatDescription('test')
  return (
    <section className="relative overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.35),_transparent_65%)]" />
      <div className="pointer-events-none absolute -left-16 top-1/4 h-60 w-60 rounded-full bg-gradient-to-r from-cyan-500/40 to-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 bottom-4 h-72 w-72 rounded-full bg-gradient-to-t from-amber-400/40 to-transparent blur-3xl" />
      <div className="relative space-y-10">
        <Container1Header headerText="EXCLUSIVE DEALS FOR OUR TOP CRUISE DESTINATION PICKS" />
        <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {await mapTileData(sortedDestinations)}
        </div>
      </div>
    </section>
  );
}
