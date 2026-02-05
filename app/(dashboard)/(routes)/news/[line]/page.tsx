"use client";
import { useEffect, useContext } from "react";
import RSSParser from "rss-parser";
import { getFeed } from "../getfeed";
import Image from "next/image";
import { NewsContext } from "../newscontext";
import Link from "next/link";
import FeedJson from '../cruiseLineFeeds.json'
import { shipLogos } from "@/app/utils/shiplogos";
import { useParams } from "next/navigation";

interface NewsFeedLine {
  lineName: string;
  feedURL: string;
  hidden?: boolean;
}

const feeds = FeedJson as NewsFeedLine[];



//import {ChatCompletionRequestMessage} from "openai-api";
//import ChatCompletionRequestMessageRoleEnum from "openai"
export type Feed = {
  lineTitle: string | undefined;
  articles: RSSParser.Item[];
};

const Page = () => {
  const params = useParams();
  const line = params?.line;
  console.log(line)
  const lineIndex = line ? Number(line) : undefined;
  const feedData =
    lineIndex != null && !Number.isNaN(lineIndex) ? feeds[lineIndex] : undefined;
  const lineName = feedData?.lineName ?? "";
  const feedURL = feedData?.feedURL ?? "";
  console.log(lineName, feedURL)
  const {setNews, news} = useContext(NewsContext)
  useEffect(() => {
    if (!feedURL) {
      return;
    }
    const fetchFeed = async () => {
      const data:Feed = await getFeed(feedURL);
      setNews(data);
      
      console.log(data.lineTitle)
      console.log(data.articles);
    }
    fetchFeed();
  }, [feedURL, setNews])

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
