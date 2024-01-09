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
const res = (await fetch(
  "https://www.cruisebrothers.com/specials",
  {cache:'no-store'}
  ));
console.log("www.cruisebrothers.com/specials result => ",res);
const resultList = await res.text();
//console.log(resultList);
  const $ = load(resultList);

  const list = $(".sr-specials").find("li");
//console.log(list.text());
  list.each(function (index, element) {
    let obj = {};
    obj.header = $(this).find("h3").text().trim();
    obj.link = $(this).find("a").attr("href");
    obj.message = $(this).text().trim();

    specials.push(obj);

  });
  //console.log(specials);
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


