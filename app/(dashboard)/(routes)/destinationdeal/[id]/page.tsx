import React from "react";
import { cbPicks } from "./index.js";
import { notFound } from "next/navigation";
import { DollarSign, Calendar } from "lucide-react";
import Image from "next/image.js";
import { shipLogos } from "@/app/utils/shiplogos.ts";
import pexelmachine from "@/app/utils/CommonObjects/pexelmachine";
import { getGoogleImage } from "@/app/utils/CommonObjects/googleimage";
import { Container1Header } from "@/components/containers/container1";
import { CBPickData } from "@/components/cb/cbdestinationpickstile.jsx";
import { generateDealContent } from "@/lib/deals-utils";

import Link from "next/link.js";

interface ItineraryItem {
  day: string;
  port: string;
  portImage?: string;
}

interface PickPageComponentProps {
  title?: string; ///a creative title for this trip
  subtitle?: string; /// supporting text for the title
  mainImage?: string; ///a search term for a main image
  mainImageAlt?: string; ///alt text for the main image
  bodyText?: string; ///write an attractive description of the deal including the ship, itinerary, and ports of call along with any special features and amenities using around 200 words.
  featuresText?: [string]; ///list special excursions, dining specials, onboard credits, etc.
  itinerary?: [ItineraryItem]; ///list the ports of call if possible and the days of the week they are visited if possible
}
export interface gptTask {
  task: string;
  instruction: string;
}

async function getData(id: string) {
  const res = await generateDealContent(id);
  console.log("res = ", res);
  return res;
}
export default async function DestinationDealPage({
  params,
}: {
  params: Promise<{ id?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const id = resolvedParams?.id as string | string[] | undefined;

  if (!id) {
    return notFound();
  }

  const idValue = Array.isArray(id) ? id.join("/") : id;
  console.log(idValue);
  const result = await getData(idValue);

  if (!result || !result.data) {
    return notFound();
  }

  const { data, pick } = result;

  const allPicks = await cbPicks();
  console.log("allPicks = ", allPicks);

  if (pick.img !== "") {
    data.featuredImage = pick.img;
  } else {
    try {
      const images = await getGoogleImage(data.mainImage, 2);
      if (images.length > 0) {
        console.log("images = ", images);
        const img = images[0];
        data.featuredImage = img.url;
      } else {
        const images = await pexelmachine(1, "cruise ship");
        data.featuredImage = images[0].srcOriginal;
      }
    } catch (error) {
      const images = await pexelmachine(1, "cruise ship");
      data.featuredImage = images[0].srcOriginal;
    }
  }

  console.log("data = ", data);

  // if (!data.bodyText) {
  //   return <div>loading...</div>
  // }
  return (
    <>
      <div className="flex flex-col my-6 space-y-8 text-left border-b-2 border-gray-400 md:mx-6">
        <div className="fixed right-0 w-16 h-16 bg-blue-400 top-16 rounded-s-xl">
          <details className="w-full h-full">
            <summary className="flex items-center justify-center w-full h-full font-bold cursor-pointer opacity-70">
              More...
            </summary>
            <div className="absolute right-16 top-0 z-50 min-w-[12rem] rounded-md border bg-white p-2 shadow-md">
              <div className="px-2 py-1 text-xs font-semibold text-gray-600">
                Other Deals
              </div>
              <div className="my-1 border-t" />
              <div className="flex flex-col gap-1">
                {allPicks.map((pick: CBPickData) => (
                  <Link
                    key={pick.id}
                    href={`/destinationdeal/${pick.id}`}
                    className="px-2 py-1 text-sm rounded hover:bg-gray-100"
                  >
                    {pick.destination.replaceAll("Destination:", "")}
                  </Link>
                ))}
              </div>
            </div>
          </details>
        </div>

        <div className="flex flex-col items-center justify-center md:grid md:grid-flow-col md:-mt-10">
          <Image
            src={shipLogos(data.title)}
            width={100}
            height={100}
            alt="data.tile"
          />
          <Container1Header
            headerText={data.title.replaceAll('"', "") || "nothing"}
          />
        </div>
        <div className="flex flex-col md:flex-row ">
          <div className="flex flex-col">
            <p>{data.mainImage}</p>
            <img
              alt={data.mainImageAlt || "vacation image"}
              src={data.featuredImage || ""}
              width="500px"
              height="500px"
            />
          </div>
          <div className="p-4 text-lg ">
            <h3>DEAL INCENTIVES</h3>
            {data.featuresText !== "-" &&
              data.featuresText
                .split("- ")
                .map((feature: string, idx: number) => {
                  if (!feature) return null;
                  return (
                    <div
                      key={`${feature.trim()}-${idx}`}
                      className="flex gap-3 text-sm font-extralight"
                    >
                      {/* <InfoIcon size={20} /> */}
                      <p>*</p>
                      {feature.trim()}
                    </div>
                  );
                })}
          </div>
          <br />
        </div>
        <div className="flex flex-col gap-4">
          <div className="col-span-2 text-sm text-center underline md:mr-auto md:text-left">
            {data.subtitle}
          </div>
          <div className="space-y-3 text-sm font-extra-light md:w-1/3">
            <p className="flex gap-4 border-b-2">
              <DollarSign color="blue" size={16} />
              Starting at {data.price} per person!
            </p>
            <p className="flex gap-4 border-b-2">
              <Calendar color="red" size={16} />
              {data.tripLength}
            </p>
          </div>
        </div>
        <p className="text-lg underline font-extralight">Ports of interest</p>
        <div className="text-md bg-gray-50">
          {String(data.itinerary)
            .replaceAll("- ", ", ")
            .split(`, `)
            .map((line: string, index: number) => {
              if (!line) return null;
              return (
                <div key={`itinerary-${index}-${line.trim()}`} className="p-3">
                  * {line.trim()}
                </div>
              );
            })}
        </div>
        <br />

        <div className="bg-slate-100">
          {String(data.bodyText)
            .split(`\n`)
            .map((line: string, index: number) => {
              if (!line) return null;
              return (
                <div key={`bodyline-${index}-${line.trim()}`} className="p-3">
                  {line.trim()}
                </div>
              );
            })}
        </div>
        <br />
      </div>
    </>
  );
}
