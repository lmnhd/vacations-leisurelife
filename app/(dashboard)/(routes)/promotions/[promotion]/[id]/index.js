import { load } from "cheerio";
import { info } from "console";

export async function getCBSpecial(
  promotionOrSub = "cb",
  id = "special-119"
) {
  console.log("Starting", "-------------------");
  let obj = { info: [] };

  let path = "";
  if (typeof promotionOrSub === "string" && promotionOrSub.startsWith("/")) {
    path = promotionOrSub;
  } else if (promotionOrSub === "cb" && String(id).startsWith("special-")) {
    const specialId = String(id).replace("special-", "");
    path = `/cb/special/${specialId}/`;
  } else {
    path = `/specials/${promotionOrSub}/${id}`;
  }

  const data = await fetch(`https://www.cruisebrothers.com${path}`, {
    cache: "no-store"
  });
  const resultData = await data.text();
  const $ = load(resultData);

  const page = $("#cb_individual_special_container");
  const fallbackPage = page.length ? page : $(".container").find("section");

  obj.header =
    fallbackPage.find(".special-header h1").first().text().trim() ||
    fallbackPage.find("h1").first().text().trim();
  obj.headline =
    fallbackPage.find(".special-headline p").first().text().trim() || "";
  obj.vendor = fallbackPage.find(".vendor-badge").first().text().trim() || "";

  const details = fallbackPage.find(".special-details p");
  const list = details.length ? details : fallbackPage.find("p");

  list.each(function (index, p) {
    let infoArr = [];
    const strong = $(p).find("strong");
    if ($(p).find("strong").length > 0) {
      if ($(p).find("strong").find("a").length == 0) {
        obj.cta = $(p)
          .find("strong")
          .text()
          .trim()
          .replaceAll("Cruise Brothers", "Leisure Life");
      }
    }
    if ($(p).find("br").length > 0) {
      const html = $(p).html() || "";
      const parts = html
        .split(/<br\s*\/?\s*>/i)
        .map((entry) => $("<div>").html(entry).text().trim())
        .filter((entry) => entry !== "");
      infoArr.push(...parts);
    } else {
      const val = $(p).text().trim();
      if (val !== "") {
        infoArr.push(val);
      }
    }
    if (infoArr.length > 0) {
      obj.info.push(...infoArr);
    }
  });

  return obj;
}
