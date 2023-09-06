import { load } from "cheerio";
import { info } from "console";

export async function getCBSpecial(
  sub = "/carnival-cruises-july-promotions-book-today-and-save/377"
) {
    console.log("Starting","-------------------")
  let obj = { info: [] };

  const data = await fetch(`https://www.cruisebrothers.com/specials${sub}`);
  const resultData = await data.text();
  //console.log(resultData);
 
  const $ = load(resultData);

  const page = $(".container").find("section");

  obj.header = page.find("h1").text().trim();

  console.log(page.html());

  const list = $(page).find('p');
console.log(list.length);

  list.each(function (index, p) {
    console.log("ITEM",$(p).html());
    let infoArr = [];
    const strong = $(p).find("strong");
    if ($(p).find("strong").length > 0) {
        console.log("found strong")
      if ($(p).find("strong").find("a").length == 0) {
        console.log("found strong no a")
        obj.cta = $(p)
          .find("strong")
          .text()
          .trim()
          .replaceAll("Cruise Brothers", "Leisure Life");
      }
    }
    if ($(p).find("br").length > 0) {
        console.log("found br")
      var html = $(p).html();
      console.log("HTML = : ",html);
      infoArr.push(html.split("<br>"));
    } else{
        const val = $(p).text().trim();
        if(val !== ''){
            infoArr.push($(p).text().trim());
        }
        
    }
    if (infoArr.length > 0) {
       
      obj.info.push(infoArr);
    }
  });

  return obj;
}
