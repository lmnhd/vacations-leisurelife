

import React from "react";
import { getCBSpecials, cbPicks } from "./index.js";
import { shipLogos } from "@/app/utils/shiplogos.ts";
import {Container1, Container1Header, containerProps} from '@/components/containers/container1.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image, { StaticImageData } from "next/image.js";
import { StaticImport } from "next/dist/shared/lib/get-img-props.js";
import Link from "next/link";


async function check() {
  "use server"
  console.log("checked");
}
export default async function Promotions() {
  const promos: any = await getCBSpecials();
  const picks: any = await cbPicks();
  const sortedPicks: any[] = picks.sort((a: any, b: any) => {
    if (
      a.destination.replace("Destination:", "") <
      b.destination.replace("Destination:", "")
    ) {
      return -1;
    }
  });

  // console.log(picks);
  return (
    <div className="mt-0">
      <Tabs defaultValue="promotions" className="w-full bg-gray-100 ">
        <TabsList className="w-full bg-primary font-light text-primary-foreground rounded-none">
          <TabsTrigger value="promotions">Top Promotions</TabsTrigger>
          <TabsTrigger value="picks">Top Destination Picks</TabsTrigger>
        </TabsList>
        <TabsContent value="promotions">
          <div>
            <div className="shadow-sm ">
              <Container1Header headerText="TAKE ADVANTAGE OF THESE SPECIAL OFFERS FROM TOP CRUISE LINES!"/>
            </div>
            <div className="flex  flex-wrap gap-2 items-start justify-evenly">
              {promos.map((item: any, index: number) => {
                const logo = shipLogos(item.header);
                //console.log(logo);
                return (
                  <Link 
                  key={item.header}
                  href={item.link.replace("specials", "promotions")}>
                    <Container1
                      messages={[item.message]}
                      header={item.header}
                      logo={logo}
                      height="500px"
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="picks">
          <div>
            {/* <h2 className="text-2xl text-center text-primary my-4 font-bold">
              Top Destination Picks
            </h2> */}
            <Tabs defaultValue="0" className="w-full bg-gray-100 -mt-2">
              <div className="grid grid-cols-2">
                <Container1Header headerText="OUR SPECIAL CHOICE DESTINATION PACKAGES!"/>
                <TabsList className="bg-primary text-primary-foreground rounded-none flex flex-wrap h-auto ">
                  {sortedPicks.map((item: any, index: number) => {
                    return (
                      <TabsTrigger 
                      key={item.destination}
                      value={index.toString()} className="shadow-sm text-accent font-extralight">
                        {item.destination.replace("Destination:", "")}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>
              {sortedPicks.map((item: any, index: number) => {
                console.log(item);
                const logo = shipLogos(item.what);
                const picksArr: any[] = Object.values(item).filter(
                  (item: any, index: number) => index !== 0
                );
                
                return (
                  <TabsContent 
                  key={index.toString()} 
                  value={index.toString()}>
                    <div>
                      
                      <div className="-mt-2">
                        
                        <Container1
                        
                          //messages={}
                          header={item.destination}
                          logo={logo}
                          //height="500px"
                          width="w-full"
                          shortLists={picksArr}
                          subHeader={item.what.replace("What:", "")}
                          images={item.img !== "" ? [item.img] : []}
                          buttonAction={check}
                          buttonText="Book This Now"
                        />
                      </div>
                     
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
            {/* <div className="flex flex-wrap items-center justify-center xl:grid xl:grid-cols-2 xl:items-start my-0">
              {picks
                .sort((a: any, b: any) => {
                  if (a.img !== "") {
                    return -1;
                  }
                  return 1;
                })
                .map((item: any, index: number) => {
                  console.log(item);
                  const logo = shipLogos(item.what);
                  const picksArr: any[] = Object.values(item).filter(
                    (item: any, index: number) => index !== 0
                  );
                  //console.log(picksArr);
                  return (
                    <div className="">
                      <Container
                        //messages={}
                        header={item.destination}
                        logo={logo}
                        //height="500px"
                        width="full"
                        shortLists={picksArr}
                        images={item.img !== "" ? [item.img] : []}
                      />
                    </div>
                  );
                })}
            </div> */}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
