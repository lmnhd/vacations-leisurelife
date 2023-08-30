import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { load } from "cheerio";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cookies = getCookies();
const cookie = `${cookies[4].name}=${cookies[4].value}`;
console.log(cookie);

export function search(
  url = "https://www.vacationstogo.com/ticker.cfm?incCT=y&sm=202311&tm=202312&r=0&l=14&s=0&n=2&d=0&v=0"
) {
  return new Promise((resolve, reject) => {
    axios
      .get(url, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        //, params: params,
      })
      .then((response) => {
        const $ = load(response.data);
        const html = $("html").html();
        const vtg = $(".vtg-layout-main").text();
        const deals = $(".deals").text();
        if (deals != "") {
          const arr = createJSONFromTags(html);
          const final = JSON.stringify(arr);

          resolve(arr);
        } else {
          resolve(vtg);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}

export function getCookies(
  cookiefile = path.join(process.cwd(), "/app/api/vtgSearch/cookies.json")
) {
  // const thisDirectory = path.join(process.cwd(),"/app/api/vtgSearch/cookies.json")
  // console.log(thisDirectory)
  const cookiestring = fs.readFileSync(cookiefile);

  const cookies = JSON.parse(cookiestring);

  return cookies;
}

export function start() {
  console.log("hello");
  // const result = (getVTG().then((res) => console.log(res)));
}

function createJSONFromTags(html) {
  const objList = [];
  const $ = load(html);
  const allDeals = $("table.deals");
  const allRegions = $("table.region");

  allDeals.each((index, element) => {
    let dealRegion = {};
    const region = allRegions[index];
    const regionName = $(region).find("a").text().trim();
    const tbody = $(element).find("tbody");
    dealRegion.region = regionName;
    dealRegion.deals = [];
    const sailings = $(tbody).find("tr");
    sailings.each((j, sailing) => {
      const regionDeal = {};
      regionDeal["fdeal"] = $(sailing).find(".fd").text();
      regionDeal["nights"] = $(sailing).find(".n").text();
      regionDeal["fromPort"] = $(sailing).find(".d > a").text();
      regionDeal["toPort"] = $(sailing).find(".e > a").text();
      regionDeal["veiwport"] = $(sailing).find(".d > a").attr("href");
      regionDeal["portId"] = $(sailing)
        .find(".d > a")
        .attr("href")
        .match(/[\d]+/g)[0];
      regionDeal["shipId"] = $(sailing)
        .find(".ls > a:last")
        .attr("href")
        .match(/[\d]+/g)[0];
      regionDeal["line"] = $(sailing).find(".ls > a:first").text();
      regionDeal["date"] = $(sailing).find(".dt").text();
      regionDeal["ship"] = $(sailing).find(".ls > a:last").text();
      regionDeal["rating"] = $(sailing).find(".r").text();
      regionDeal["brPrice"] = $(sailing).find(".br").text();
      regionDeal["ourPrice"] = $(sailing).find(".our").text();
      regionDeal["youSave"] = $(sailing).find(".p").text();
      regionDeal["status"] = $(sailing).find(".st").text();
      dealRegion.deals.push(regionDeal);
    });
    objList.push(dealRegion);
  });
  return objList;
}

//start();
