import GoogleImages from "google-images";
import prismadb from "@/lib/prismadb";
import { getOnlyUniqueRandomNumbersBetween } from "./pexelmachine";

const apiKey = process.env.GOOGLE_SEARCH_API_KEY || "";

const id = process.env.GOOGLE_SEARCH_ENGINE_ID || "";

const client = new GoogleImages(id, apiKey);

 async function checkForStoredImage(
  searchQuery: string,
  numResults: number
) {
  let result: any[] = [];
  const search = await prismadb.googleImageResource.findMany({
    where: {
      searchQuery: searchQuery,
      ignore: false
    },
  });
  if (search.length >= numResults) {
    const randomNumbers = getOnlyUniqueRandomNumbersBetween(numResults);
    const res = randomNumbers.map((num) => {
      return search[num];
    });
    result = res;
  } else {
    return result;
  }
}

 async function storeImageData(photo: any, query: string) {
  try {
    new Promise((resolve) => setTimeout(resolve, 500));
  const check = await prismadb.googleImageResource.findMany({
    where: {
      url: photo.url,
      searchQuery: query,
  }})
  if(check.length == 0){
  const res = await prismadb.googleImageResource.create({
    data: {
      searchQuery: query,
      type: photo.type,
      width: photo.width,
      height: photo.height,
      thumbnail: photo.thumbnail.url,
      description: photo.description,
      parentPage: photo.parentPage,
      url: photo.url,
    },
  });
  return res;
}
  } catch (error) {
    return photo
  }
  
}
export async function getGoogleImage(query: string, numResults: number) {
  //check if image is stored in db
  const storedImages = (await checkForStoredImage(query, numResults)) || [];
  if (storedImages.length >= numResults) {
    console.log("found google images in db for query: ", query);
    return storedImages;
  } else {
    const result: any[] = [];
    const images: any[] = await client.search(query);
    //store images in db
    for (let i = 0; i < numResults; i++) {
      await storeImageData(images[i], query);
      result.push({
        searchQuery: query,
        type: images[i].type,
        width: images[i].width,
        height: images[i].height,
        thumbnail: images[i].thumbnail.url,
        description: images[i].description,
        parentPage: images[i].parentPage,
        url: images[i].url,
      });
    }

    return result;
  }
}
