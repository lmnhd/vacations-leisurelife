import { load } from "cheerio";
import fs from "fs";
import path from "path";

import puppeteer from "puppeteer-extra";
//import StealthPlugin from "puppeteer-extra-plugin-stealth";


//puppeteer.use(StealthPlugin())

import destinations from '../destinations.json' assert { type: "json" };
import axios from "axios";

const baseURL = "https://www.cruisebrothers.com/destinations";
const _baseURL = "https://www.cruisebrothers.com";

//USED ONLY ONCE TO GET DESTINATIONS LIST
async function getDestinationsList(){
    const result = []
    const data = await fetch(baseURL);
    const resultData = await data.text();
    const $ = load(resultData);
    const ul = $("ul.sr-categories");
    const list = $(ul).find("li");
    //console.log(`${list.length} destinations found`);
    list.each(function(index, element){
        const href = $(element).find("a").attr("href");
        //console.log(href);
        const strings = href.match(/\/destinations\/(.*)/)[1].split("/");
        //console.log(strings);
        result.push(strings);

    })
   console.log(result);
   fs.writeFileSync("destinations.json",JSON.stringify(result)) ;

}
export function getRandomNumberBetween(min,max){
    return Math.floor(Math.random() * (max - min + 1) + min);
}
function getDestinationParamArrayCB(destString){
    const result = destString.match(/\/destinations\/(.*)/)[1].split("/");
    return result;
}

async function getImageTagsFromWebCB(destination = "africa", page = "1"){
    const url = `${baseURL}/${destination}/${page}`;
    console.log(url)
    let finalLinksArray = [];
    const data = await fetch(url);
    const resultData = await data.text();
    //console.log(resultData);
    const $ = load(resultData);
    const section = $("section");
    const imagelinks = $(section).find("img");
    if(imagelinks.length > 0){
        console.log(`${imagelinks.length} images found`);
        imagelinks.each(function(index, element){
            //console.log($(element).attr("alt"));
            finalLinksArray.push({src:`${_baseURL}/${$(element).attr("src")}`,
            alt:$(element).attr("alt")});
        })
        
    }
    console.log(finalLinksArray);
    return finalLinksArray

}

async function getImageUrlsForDestinatioinCB(destinationText = "Visit Africa"){
    let result = [];
    destinations.forEach( (destination) => {
        if(destinationText.toUpperCase().includes(destination[0].toUpperCase())){
            console.log(`Getting images for ${destination[0]}`)
           //result = getImageTagsFromWebCB(destination[0], destination[1]);
           result = getImageTagsFromWebCB(destination[0], destination[1]);
        }
    })
    return result;
}

export async function checkPixaBay(searchString,numImages = 1){
    let result = [];
    let html = ""
    console.log(`Getting ${numImages} images for ${searchString}`)
    const testURL = 'https://pixabay.com/images/search/alaska/'
    puppeteer.launch({ headless: "new" }).then(async browser => {
        const page = await browser.newPage();
        await page.goto(testURL);
        new Promise(resolve => setTimeout(resolve, 5000));
        const content = await page.content();
        const $ = load(content);
         html = $("html").text();
         const body = $("body").text();
        console.log(body.substring(0,3000));

        await browser.close();

    }
    );
    // const testing = await fetch(testURL)
    // const resultData = (await testing.text()).substring(0,300);
    // let result = [resultData]
    // console.log(result);
    return result;
}

export async function GetCBDestinatioinImages(fromText = 'caribbean'){
    if(fromText.includes('caribbean')){fromText = 'caribbean-bermuda'}
    if(fromText.includes('bermuda')){fromText = 'caribbean-bermuda'}
    if(fromText.includes('australia')){fromText = 'australia-new-zealand'}
    if(fromText.includes('zealand')){fromText = 'australia-new-zealand'}
const result = await getImageUrlsForDestinatioinCB(fromText);
console.log(JSON.stringify(result));
}

//await GetCBDestinatioinImages('antarctica')
//await checkPixaBay();
//  const result = await checkPixaBay('antarctica map',7)
// console.log(result);