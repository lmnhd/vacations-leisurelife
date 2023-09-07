import { load } from "cheerio";
import fs from "fs";
import path from "path";

import destinations from '../destinations.json' assert { type: "json" };

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
function getRandomNumberBetween(min,max){
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
    console.log(`Getting ${numImages} images for ${searchString}`)
    let result = []
    const url = `https://google.com/` 
    console.log(url);
    // const url = `https://pixabay.com/images/search/${searchString}/`
    // const data = await fetch(url);
    // const resultData = await data.text();
    // console.log(resultData);
//     const $ = load(resultData);
//     const images = $("img");
//     console.log(images.length);
//     const links = []
//     images.each(function(index, element){
//         const src = $(element).attr("src");
//         let alt = $(element).attr("alt");
//         if(alt == undefined){alt = searchString} 
//         const obj = {}

//         if(src !== undefined ){
//             console.log(src);
//             if(src.includes('.jpg')){
//                 obj.src = src;
//                 obj.alt = alt;
//             console.log(obj);
//             result.push(obj);
//             }
           
// }})
//     for(let i = 0; i < numImages; i++){
//         const itemNum = getRandomNumberBetween(0,result.length);
//         links.push(result[itemNum]);
//     }
//     //console.log(links);
//     result = links;
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
// const result = await checkPixaBay('antarctica map',7)
// console.log(result);