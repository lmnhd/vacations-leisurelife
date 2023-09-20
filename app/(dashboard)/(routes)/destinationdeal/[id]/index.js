import { load } from "cheerio";

export async function cbPicks() {
  const url = "https://www.cruisebrothers.com/the-brothers-picks";
  const baseURL = "https://www.cruisebrothers.com";
  const data = await fetch(url);
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
      obj.img = "";
      if (!String(check).trim().includes("Destination:")) {
        //console.log("skipping");
        j = -1;
      } else {
        obj.destination = $(child).text();
        const img = $(child).find("img");
        const src = `${baseURL}${img.attr("src")}`;
        if (img.length > 0) {
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
      if ($(child).find("img").length > 0) {
        const src = `${baseURL}${$(child).find("img").attr("src")}`;
        obj.img = src;
        if (obj.img == undefined || obj.img == "") {
          j++;
        }
      } else {
        j++;
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
      obj.id = pickID(obj);
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

export async function cbPick(pickID) {
  console.log('cbPick',pickID)
  
  return new Promise(async (resolve, reject) => { 
    const picks = await cbPicks();
  console.log('loaded picks => ');
  const result = picks.find((pick) => {
    return pick.id == pickID
  })
  resolve(result);
  })
  
  // for (let index = 0; index < picks.length; index++) {
  //   const pick = picks[index];
  //   //console.log(pick);
  //   if (pick.id == pickID) {
  //     console.log('FOUND PICK => ',pick.id)
  //     return pick;
  //   }
  // }
  // return result;
}

export function pickID(pick) {
  return String(`${pick.what}-${pick.when}`).replaceAll(" ", "").replaceAll('.','');
}
