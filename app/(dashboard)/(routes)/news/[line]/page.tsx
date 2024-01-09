"use client";
import { useState, useEffect, useContext } from "react";
import RSSParser from "rss-parser";
import { getFeed } from "../getfeed";
import Image from "next/image";
import { NewsContext, NewsProvider } from "../newscontext";
import Link from "next/link";
import FeedJson from '../cruiseLineFeeds.json'
import { shipLogos } from "@/app/utils/shiplogos";



//import {ChatCompletionRequestMessage} from "openai-api";
//import ChatCompletionRequestMessageRoleEnum from "openai"
export type Feed = {
  lineTitle: string | undefined;
  articles: RSSParser.Item[];
};

const Page = (params:any) => {
  const {line} = params.params
  console.log(line)
  const lineName = FeedJson[line].lineName
  const feedURL = FeedJson[line].feedURL
  console.log(lineName, feedURL)
const {setNews, news} = useContext(NewsContext)
useEffect(() => {
 const fetchFeed = async () => {
  const data:Feed = await getFeed(feedURL);
  setNews(data);
  
  console.log(data.lineTitle)
  console.log(data.articles);
 }
  fetchFeed();
}, [])

//return <>check</>
  return (
    <div className="bg-slate-800? text-center font-bold text-green-400 h-screen">
      
      <div className="flex flex-col items-center justify-center text-4xl mb-12  mx-auto text-center">
        <Image src={shipLogos(lineName)} alt="Cruise Line Logo" className="w-24 h-24 " />
        <h1 className="text-4xl mx-8 mt-12 text-blue-800">{news.lineTitle}</h1>
      </div>
      <div className="flex flex-col items-center p-5">
        {news &&
          news.articles.map((result: RSSParser.Item, index: number) => {
            console.log(result);
            return (
              <div className="flex flex-col  items-center p-3 gap-1 mt-2" key={result.title}>
                <h1 className="text-lg font-bold border-b-2 text-slate-900 mt-10">{result.title}</h1>
                
                <Link href={`/news/${line}/${index}`}>
                  <p className="text-md font-bold underline text-red-900 mt-3">Read More</p> 
                </Link>
                {/* <div 
                className="font-normal text-left text-slate-900"
                dangerouslySetInnerHTML={{ __html: result.content || <></> }}
                >

                </div> */}
              </div>
            );
          })}
      </div>
    </div>
  )
};

export default Page;
