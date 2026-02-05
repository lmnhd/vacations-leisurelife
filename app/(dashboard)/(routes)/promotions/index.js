import fs from "fs";
import { load } from "cheerio";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const paramsJSON = "/SearchData/SearchParams.json";
import axios, { all } from "axios";

export async function getCBSpecials() {
  const specials = [];
  //const resultList = await axios.get("https://www.cruisebrothers.com/specials");
  const res = await fetch(
    "https://www.cruisebrothers.com/cb/specials",
    { cache: "no-store" }
  );
  console.log("www.cruisebrothers.com/cb/specials result => ", res);
  const resultList = await res.text();
  const $ = load(resultList);

  const baseURL = "https://www.cruisebrothers.com";
  const specialsMap = new Map();

  const cards = $(
    ".cb_specials_full_card_container, article.cb_specials_full_card_container"
  );
  cards.each(function () {
    const card = $(this);
    const header = card.find(".cb_full_card_special_name").first().text().trim();
    const message = card
      .find(".cb_full_card_special_headline")
      .first()
      .text()
      .trim();
    const href = card.find("a[href*='/cb/special/']").first().attr("href");
    const absoluteLink = href
      ? href.startsWith("http")
        ? href
        : `${baseURL}${href}`
      : "";

    if (!header || !absoluteLink) {
      return;
    }

    if (!specialsMap.has(absoluteLink)) {
      specialsMap.set(absoluteLink, {
        header,
        link: absoluteLink,
        message
      });
    }
  });

  if (specialsMap.size === 0) {
    const links = $("a[href*='/cb/special/']");
    links.each(function () {
      const linkEl = $(this);
      const href = linkEl.attr("href");
      if (!href) {
        return;
      }

      const absoluteLink = href.startsWith("http") ? href : `${baseURL}${href}`;
      const container = linkEl.closest(
        "article.cb_specials_full_card_container, div.cb_specials_full_card, article, section, div"
      );

      const header =
        container.find(".cb_full_card_special_name").first().text().trim() ||
        container.find("h2, h3").first().text().trim() ||
        linkEl.prevAll("h2, h3").first().text().trim();

      const message =
        container.find(".cb_full_card_special_headline").first().text().trim() ||
        container.find("p").first().text().trim() ||
        linkEl.prevAll("p").first().text().trim();

      if (!header) {
        return;
      }

      if (!specialsMap.has(absoluteLink)) {
        specialsMap.set(absoluteLink, {
          header,
          link: absoluteLink,
          message
        });
      }
    });
  }

  specials.push(...Array.from(specialsMap.values()));
  console.log("Special offer list", specials);
  return specials;
}

export async function cbPicks() {
  const url = "https://www.cruisebrothers.com/the-brothers-picks";
  const baseURL = "https://www.cruisebrothers.com";
  const data = await fetch(url,{cache:'no-store'});
  const resultData = await data.text();
  const $ = load(resultData);
  const section = $("section");
  let arr = [];
  let obj = {};
  let j = 0;
  let rowNum = 0;
  section.children("p").each(function (index, child) {
    const el = child.type;
    const name = child.name;
    let check = $(child).text();
    //console.log(check);
    if (rowNum == 17) {
      //console.log(arr);
    }

    if (String(check).includes("_______________________________")) {
      //console.log("check");
      j = -1;
    } else {
    }

    if (j == 0) {
      obj.img = ''
      if (!String(check).trim().includes("Destination:")) {
        //console.log("skipping");
        j = -1;
      } else {
        obj.destination = $(child).text();
        const img = $(child).find("img")
        const src = `${baseURL}${img.attr("src")}`;
        if(img.length > 0) {
          obj.img = src;
        }
      }
    }
    if (j == 1) {
      if (!String(check).trim().includes("What:")) {
        //console.log("skipping");
        j = -1;
      } else {
        obj.what = $(child).text().trim();
      }
    }
    if (j == 2) {
      if($(child).find("img").length > 0){
        const src = `${baseURL}${$(child).find("img").attr("src")}`;
        obj.img = src;
        if (obj.img == undefined || obj.img == "") {
          j++;
        }
        }else{
          j++
      }
     
    }
    if (j == 3) {
      if (!String(check).trim().includes("When:")) {
        //console.log("skipping");
        j = -1;
      } else {
        obj.when = $(child).text().trim();
      }
    }
    if (j == 4) {
      obj.price = $(child).text().trim();
    }
    if (j == 5) {
      obj.elsepay = $(child).text().trim();
    }
    if (j == 6) {
      obj.go = $(child).text().trim();
    }
    if (j == 7) {
      obj.why = $(child).text().trim();
    }
    if (j == 8) {
      obj.other = $(child).text().trim();
      j = -1;
      obj.id = rowNum;
      arr.push(obj);
      obj = {};
      rowNum++;
    }
    j++;
    if (rowNum == 2) {
      //console.log(arr);
    }
  });
  //console.log(arr);
  return arr;
}


