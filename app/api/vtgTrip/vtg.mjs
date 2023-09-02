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

export async function getDealData(dealNum = 13289, shipNum = 837) {
  //https://www.vacationstogo.com/fastdeal_tab.cfm?deal=13289&ship=837&type=wifi

  let dealPageObjects = {};
  try {
    let pageData = await getFastDeal(dealNum);
    let $ = load(pageData);
    const html = $("html").html();
    const mainInfo = createFastDealOBJ(html);

    pageData = await getFastDealTab(dealNum, shipNum, "itinerary");
    $ = load(pageData);
    const itineraryHTML = $("html").html();
    const itinerary = createItineraryOBJ(itineraryHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "ship");
    $ = load(pageData);
    const shipHTML = $("html").html();
    const ship = createShipOBJ(shipHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "photo");
    $ = load(pageData);
    const photosHTML = $("html").html();
    const photos = createPhotosOBJ(photosHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "cabin");
    $ = load(pageData);
    const cabinHTML = $("html").html();
    const cabin = createCabinsOBJ(cabinHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "deckplan");
    $ = load(pageData);
    const decksHTML = $("html").html();
    const decks = createDeckPlanOBJ(decksHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "dining");
    $ = load(pageData);
    const diningHTML = $("html").html();
    const dining = createDiningOBJ(diningHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "port");
    $ = load(pageData);
    const portsHTML = $("html").html();
    const ports = createPortsOBJ(portsHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "wifi");
    $ = load(pageData);
    const wifiHTML = $("html").html();
    const wifi = createWIFIOBJ(wifiHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "specialneed");
    $ = load(pageData);
    const needsHTML = $("html").html();
    const needs = createNeedsOBJ(needsHTML);

    pageData = await getFastDealTab(dealNum, shipNum, "weather");
    $ = load(pageData);
    const weatherHTML = $("html").html();
    const weather = createWeatherOBJ(weatherHTML);

    dealPageObjects = {
      ["mainInfo"]: mainInfo,
      ["itinerary"]: itinerary,
      ["ship"]: ship,
      ["photos"]: photos,
      ["cabin"]: cabin,
      ["decks"]: decks,
      ["dining"]: dining,
      ["ports"]: ports,
      ["wifi"]: wifi,
      ["needs"]: needs,
      ["weather"]: weather,
    };
  } catch (error) {
    console.log(error);
    return error;
  }
  return dealPageObjects;
  //console.log(dealPageObjects);
}
function getFastDeal(dealNumber) {
  const url = `https://www.vacationstogo.com/fastdeal.cfm?deal=${dealNumber}`;
  return new Promise((resolve, reject) => {
    axios
      .get(url, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
      })
      .then((response) => {
        const page = load(response.data);
        const html = page.html();
        resolve(html);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
function createFastDealOBJ(html) {
  let obj = {};
  const $ = load(html);
  const dealDiv = $(".fastdeal-div");

  obj["dealNumber"] = Number(
    dealDiv
      .find("h1")
      .text()
      .match(/([\d])\w+[\d]+/g)[0]
  );
  obj["dealName"] = dealDiv.text().split(",")[0].trim().split(`\n`)[1];
  obj["cruiseLine"] = dealDiv.find("a:first").text();
  obj["shipName"] = $(".fastdeal-div > a:last").text();
  
  
  //prices
  const priceContainers = dealDiv.find(".fastdeal-meta-container-outer");
  const prices = [];
  let i = 0;
  let group = {};
  let sub = [];
  priceContainers.each((j, container) => {
    
    //sub = [];
    console.log($(container).html());
    
      const header = $(container)
        .find(".price-label")
        .text()
        .trim()
       ;
      
      
      if(header != ''){
        group["label"] = $(container).find(".price-label").text().trim();
       group["amount"] = $(container).find(".price-amount").text().trim();
       //group["header"] = header;
       sub.push(group);
       group = {};

       if (header == "You Save") {
        
        prices.push(sub)
        i = 0;
        sub = [];
        group = {};}else{
          
          // group["header"] = header;
           //prices.push(group)
        }
      }
     
      
   //prices.push(group);

    i++;
  });
  obj["prices"] = prices;

  const important = `Prices are in US dollars, per person, based on double occupancy. Prices are subject to change without notice by cruise lines until a deposit has been made, and must be reconfirmed at time of booking. Prices include port charges but do not include airfare or (where applicable) airport or government taxes or fees. Prices and promotions are for new bookings only, in accordance with cruise line policies. Click any price to convert to other currencies.`;
  obj["important"] = important;
  console.log(obj);
  return obj;
}

function createNeedsOBJ(html) {
  let obj = {};
  //console.log(html);
  const $ = load(html);
  const specialNeedsTables = $("#table_ship_special_needs");
  const numSNTables = specialNeedsTables.length;
  const needs3 = $("#table_ship_accessible_cabins");
  obj["accessibleCabins"] = $(needs3).html();
  let array = [];
  specialNeedsTables.each((i, table) => {
    obj[`specialNeedsHTML${i + 1}`] = $(table).html();
    const needs1_2 = $(table).find("tbody");

    const rows1_2 = $(needs1_2).find("tr");
    //const rows3 = $(needs3).find("tr");

    rows1_2.each((i, row) => {
      var ob = {};

      var numCells = $(row).find("td").length;
      $(row)
        .find("td")
        .each((j, td) => {
          const cell = $(td).text().trim();
          if (numCells == 1) {
            ob["header"] = cell;
          } else {
            ob[j == 0 ? "label" : "value"] = cell;
          }
        });

      array.push(ob);
    });
  });

  obj["raw"] = html;

  return obj;
}
function createWeatherOBJ(html) {
  let obj = {};
  console.log(html);
  const $ = load(html);
  obj["tableDiv"] = $("table").html();

  return obj;
}
function createWIFIOBJ(html) {
  let obj = {};
  console.log(html);
  const $ = load(html);
  const paragraphs = $("p:first").text();
  const tbody = $("tbody");
  obj["tableHTML"] = $(tbody).html();

  obj["info1"] = $("p:first").text().trim();
  obj["info2"] = $("p:last").text().trim();
  const rows = $(".tab-pane").find("tr");
  obj["raw"] = html;

  return obj;
}
function createPortsOBJ(html) {
  //let obj = {};
  const $ = load(html);
  const tbody = $("tbody");
  const rows = $(tbody).find("tr");
  let array = [];
  rows.each((i, row) => {
    var ob = {};
    ob["raw"] = $(row).html();
    ob["portName"] = $(row).find("b").text();
    ob["info"] = $(row).find("p").text().trim();
    ob["caption"] = $(row)
      .find("span")
      .text()
      .split("\n\n")[0]
      .replace(`\n`, "");
    ob["image"] = $(row).find("img").attr("src");
    if (ob.image) {
      array.push(ob);
    }
  });
  return array;
}
function createDiningOBJ(html) {
  //let obj = {};
  const $ = load(html);
  const tbody = $("tbody");
  const rows = $(tbody).find("tr");
  let array = [];
  rows.each((i, row) => {
    var ob = {};

    ob["textHTML"] = $(row).find("td:nth-child(2)").html();

    ob["image"] = $(row).find("img").attr("src");

    array.push(ob);
  });
  return array;
}
function createItineraryOBJ(html) {
  let obj = {};
  const $ = load(html);
  const tbody = $("tbody");
  const rows = $(tbody).find("tr");
  let array = [];
  rows.each((i, row) => {
    var ob = {};
    ob["location"] = $(row).find(".tr_content > td:nth-child(2)").text().trim();
    ob["time"] = $(row).find(".tr_content > td:nth-child(4)").text().trim();
    ob["date"] = $(row).find(".tr_content > td:nth-child(1)").text().trim();
    ob["raw"] = $(row).html();
    array.push(ob);
  });
  obj["itineraryMap"] = $(".fastdeal_itinerary_map > img").attr("src");
  obj["dates"] = array;
  return obj;
}
function createShipOBJ(html) {
  let obj = {};
  const $ = load(html);
  obj["name"] = $("#div_ship_header").text().trim();
  obj["rating"] = $(".fastdeal-tab-ship-rating").children().length;
  obj["description"] = $("#div_ship_description").text().trim();
  const shipDatas = $(".ship_data");
  let array = [];
  shipDatas.each((i, data) => {
    const label = $(data).find(".ship_label").text().trim();
    const value = $(data).find(".table_ship_amenities_data").text().trim();
    array.push({ label: label, value: value });
  });
  obj["info"] = array;
  obj["raw"] = html;
  return obj;
}

function createPhotosOBJ(html) {
  let obj = {};
  const $ = load(html);
  const FastdealPhoto = $("#FastdealPhoto");
  const images = $(FastdealPhoto).find("img");
  let array = [];
  images.each((i, image) => {
    const src = $(image).attr("src");
    const caption = $(image).attr("data-caption");
    array.push({ src: src, caption: caption });
  });
  console.log(images);

  return array;
}
function createCabinsOBJ(html) {
  //let ob = {};
  const $ = load(html);
  const tbody = $("tbody");
  const rows = $(tbody).find("tr");
  let array = [];
  rows.each((i, row) => {
    let ob = {};
    ob["raw"] = $(row).html();
    ob["img"] = $(row).find("img").attr("src");
    ob["category"] = $(row).find("b").text().trim();
    ob["description"] = $(row).find("td:last").text().trim();
    if (ob.img) {
      array.push(ob);
    }
  });

  return array;
}
function createDeckPlanOBJ(html) {
  let obj = {};
  const $ = load(html);
  const deckPlansDiv = $("#deckPlan");
  obj["mainIMG"] = deckPlansDiv.find("img:first").attr("src");
  const deckPlans = $(deckPlansDiv).find("a");
  let array = [];

  deckPlans.each(async (i, deckPlan) => {
    let ob = {};
    ob["deck"] = $(deckPlan).text().trim();
    ob["href"] = $(deckPlan).attr("href");
    array.push(ob);
  });
  obj["decks"] = array;
  obj["raw"] = html;
  return obj;
}
function getFastDealTab(dealNumber, ship, tab) {
  const url = `https://www.vacationstogo.com/fastdeal_tab.cfm?deal=${dealNumber}&ship=${ship}&type=${tab}`;
  return new Promise((resolve, reject) => {
    axios
      .get(url, {
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
      })
      .then((response) => {
        const page = load(response.data);
        const html = page.html();
        resolve(html);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
export function start() {
  console.log("hello");
  // const result = (getVTG().then((res) => console.log(res)));
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


//start();
