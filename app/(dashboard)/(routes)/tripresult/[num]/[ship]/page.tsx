"use client";
import useSWR, { Fetcher } from "swr";

import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import Itinerary from "@/components/vtg/trip/itinerary";
import Prices from "@/components/vtg/trip/prices";
import DealCard from "@/components/vtg/trip/dealcard";
import ShipInfo from "@/components/vtg/trip/shipinfo";
import { Cabin } from "next/font/google";
import Cabins from "@/components/vtg/trip/cabins";
import Dining from "@/components/vtg/trip/dining";
import Photos from "@/components/vtg/trip/photos";

// import {
//   Typography,
//   Card,
//   Accordion,
//   AccordionHeader,
//   AccordionBody,
// } from "@material-tailwind/react";
// import { Button, Icon, Image, List, Segment } from "semantic-ui-react";
// import { useParams } from "next/navigation";

async function TripResult({ params: { ship, num } }: any) {
  const url: string = `/api/vtgTrip`;
  const fetcher: Fetcher<any> = (url: string) =>
    fetch(url, {
      method: "POST",
      body: JSON.stringify({ ship, num }),
    }).then((r) => r.json().then((data) => data));
  const { data, error } = useSWR(url, fetcher);
  const loadingDivClassName: string =
    "flex flex-col items-center justify-center w-screen h-screen bg-primary";
  if (error) return <div className={loadingDivClassName}>failed to load</div>;
  if (!data) return <div className={loadingDivClassName}>loading...</div>;

  console.log(data);

  
  const photoArr = data.photos.map((item: any, index: any) => {
    return { url: item.src, childrenElem: <h6>{item.caption}</h6> };
  });
  const bgImageStyle = {
    backgroundImage: `url("${data.photos[0].src}")`,
    backgroundSize: "cover",
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
  };
  const priceExcludeLabels = ["You Save", "", "Military Rate", "Our Suite"];

  const Container = ({
    children,
    shift = false,
  }: {
    children: React.ReactNode;
    shift?: boolean;
  }) => {
    return (
      <div className="grid grid-flow-row space-y-6 ">
        {/* {shift && <div></div>} */}
        <div className="grid w-full h-full grid-flow-col grid-cols-2 p-0 text-center rounded-md shadow-md vtg-ship-bg ">
          {children}
        </div>
      </div>
    );
  };
  return (
    <div className="xl:w-2/3 xl:mx-auto">
      <Container>
        <div className="p-6 mx-auto rounded-sm shadow-sm ship-image">
          <Image width={500} height={800} alt="ship" src={photoArr[0].url} />
        </div>
        <DealCard data={data} />
      </Container>

      <Container shift={true}>
        <div className="p-4 shadow-sm ">
          <p className="p-4 mx-auto text-sm font-medium text-left ">
            {data.ship.description}
          </p>
        </div>

        <Prices prices={data.mainInfo.prices} />
      </Container>

      <Tabs defaultValue="itinerary" className="w-full bg-gray-100">
        <TabsList className="w-full bg-primary text-primary-foreground">
          <TabsTrigger defaultChecked={true} value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="shipInfo">Ship Info</TabsTrigger>
          <TabsTrigger value="cabins">Cabins</TabsTrigger>
          <TabsTrigger value="dining">Dining</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          
        </TabsList>
        <div className="h-screen overflow-auto">
          <TabsContent value="itinerary">
          <Itinerary dates={data.itinerary.dates} itineraryMap={data.itinerary.itineraryMap} />
          </TabsContent>
          <TabsContent value="shipInfo"><ShipInfo info={data.ship.info}/></TabsContent>
          <TabsContent value="cabins"><Cabins cabins={data.cabin}/></TabsContent>
          <TabsContent value="dining"><Dining data={data.dining}/></TabsContent>
          <TabsContent value="photos"><Photos photos={data.photos}/></TabsContent>
        </div>
      </Tabs>

      {/* <Itinerary dates={data.itinerary.dates} /> */}
    </div>
  );
}

export default TripResult;
