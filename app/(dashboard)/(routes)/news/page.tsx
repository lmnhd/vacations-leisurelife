import React from "react";
import FeedJson from "./cruiseLineFeeds.json";
import Link from "next/link";
import Image from "next/image";
import { shipLogos } from "@/app/utils/shiplogos";


interface NewsFeedLine  {
    lineName: string;
    feedURL: string;
    hidden?: boolean;
}
export default function Page() {
  return (
    <div>
      <div className="flex justify-center">
          <h1 className="text-5xl font-bold my-12 text-blue-800 mx-auto">Cruise News</h1>
      </div>
      <div className="flex flex-wrap gap-8 justify-around items-center p-5">
        {FeedJson &&
          FeedJson.map((result: NewsFeedLine, index: number) => {
            console.log(result.lineName);
            if(result.hidden) {return null}
            return (
              <div key={index}>
                <Link key={index} href={`/news/${index}`}
                className="flex h-56 flex-col items-center mb-6 font-bold justify-between hover:scale-110 hover:border-2 hover:border-pink-600 transition-all duration-100 ease-in-out group"
                >
                    <h1 className="group-hover:text-green-600 transition-all duration-100 ease-in-out">{result.lineName}</h1>
                    <Image
                    className="group-hover:scale-50 transition-all duration-100 ease-in-out"
                    alt={`${result.lineName} Logo`}
                    width={150}
                    height={150}
                    src={shipLogos(result.lineName)}
                    />
                </Link>
               
              </div>
            );
          })}
      </div>
    </div>
  );
}
