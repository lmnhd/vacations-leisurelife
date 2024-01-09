"use client";
import React, { useContext, useState } from "react";
import { NewsContext } from "@/app/(dashboard)/(routes)/news/newscontext";
import { useSearchParams } from "next/navigation";
import RSSParser from "rss-parser";
import Link from "next/link";
import Router from "next/router";
import { useRouter } from "next/navigation";
import { shipLogos } from "@/app/utils/shiplogos";
import Image from "next/image";
import { ArticleDiv } from "./newsstyles";
import "./article.css";

export default function NewArticle(params: any) {
  const { url } = params.params;
  const { news, setNews } = useContext(NewsContext);
  const router = useRouter();

  const [article, setArticle] = useState<any>(
    news.articles[parseInt(url)]
  );
  const [lineName, setLineName] = useState(news.lineTitle);
  const log0 = shipLogos("Carnival");
  console.log("url: ", url);
  console.log("article: ", article);

  if (!article) {
    return <div>Loading...</div>;
  }
  return (
    <div>
      <div className="flex flex-col items-center justify-center text-4xl mb-12  mx-auto text-center">
        <Image src={shipLogos(lineName)} alt="Cruise Line Logo" className="w-24 h-24 " />
        <p className="border-b-2 pb-6 mx-8 mt-12 w-2/3">{article.title}</p>
      </div>

      {article["content:encoded"] ? (
        <div>
          <ArticleDiv
            className="font-normal text-left text-slate-900 p-1 px-6  mx-auto "
            dangerouslySetInnerHTML={{
              __html: article["content:encoded"] || <></>,
            }}
          ></ArticleDiv>
        </div>
      ) : (
        <ArticleDiv
          className="font-normal text-left text-slate-900 p-1 px-6  mx-auto"
          dangerouslySetInnerHTML={{ __html: article.content || <></> }}
        ></ArticleDiv>
      )}
      <div className="flex justify-center my-10">
        <button title="back" type="button" onClick={() => router.back()}>Back</button>
        {/* <Link
          href="/news"
          className="text-lg font-bold underline text-red-900 mt-3 "
        >
          Back
        </Link> */}
      </div>
    </div>
  );
}
