import { createClient } from "pexels";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";

const APP_CACHE_TABLE_NAME = process.env.APP_CACHE_TABLE_NAME ?? "lll-app-cache";
const PEXELS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const PEXELS_CACHE_TTL_MS = PEXELS_CACHE_TTL_SECONDS * 1000;

const inMemoryPexelsCache = new Map<string, { images: PexelPhotoResult[]; expiresAt: number }>();

let pexelsCacheDbEnabled = true;
let pexelsCacheDbWarningLogged = false;

function shouldSkipPexelsDbAccess(): boolean {
  if (!pexelsCacheDbEnabled) {
    if (!pexelsCacheDbWarningLogged) {
      console.warn("Pexels cache backend disabled, skipping DynamoDB lookups/writes");
      pexelsCacheDbWarningLogged = true;
    }
    return true;
  }

  return false;
}

function disablePexelsDbAccess(error: unknown): void {
  pexelsCacheDbEnabled = false;
  if (!pexelsCacheDbWarningLogged) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Disabling Pexels cache backend after DynamoDB error:", message);
    pexelsCacheDbWarningLogged = true;
  }
}

function getLocalPexelsCache(query: string): PexelPhotoResult[] {
  const key = normalizePexelsQuery(query);
  const cached = inMemoryPexelsCache.get(key);
  if (!cached) {
    return [];
  }

  if (cached.expiresAt <= Date.now()) {
    inMemoryPexelsCache.delete(key);
    return [];
  }

  return cached.images;
}

function setLocalPexelsCache(query: string, images: PexelPhotoResult[]): void {
  inMemoryPexelsCache.set(normalizePexelsQuery(query), {
    images,
    expiresAt: Date.now() + PEXELS_CACHE_TTL_MS,
  });
}

function normalizePexelsQuery(value: string): string {
  return value.trim().toLowerCase();
}

function buildPexelsCachePk(query: string): string {
  return `PEXELS#QUERY#${normalizePexelsQuery(query)}`;
}

function buildPexelsCacheSk(original: string): string {
  return `IMAGE#${original}`;
}

const examplePhoto = {
  id: 2014422,
  width: 3024,
  height: 3024,
  url: "https://www.pexels.com/photo/brown-rocks-during-golden-hour-2014422/",
  photographer: "Joey Farina",
  photographer_url: "https://www.pexels.com/@joey",
  photographer_id: 680589,
  avg_color: "#978E82",
  src: {
    original:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg",
    large2x:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    large:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    medium:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=350",
    small:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=130",
    portrait:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    landscape:
      "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    tiny: "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280",
  },
  liked: false,
  alt: "Brown Rocks During Golden Hour",
};

interface PexelPhotoResource {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string;
}
interface PexelPhotoResult {
 
    searchQuery: string;
    width: number;
    height: number;
    url: string;
    alt: string;
    photographer: string;
    photographerUrl: string;
    avgColor: string;
    srcOriginal: string;
    srcLarge2x: string;
    srcLarge: string;
    srcMedium: string;
    srcSmall: string;
    srcPortrait: string;
    srcLandscape: string;
    srcTiny: string;
    
  
}
export function getRandomNumberBetween(min:number,max:number){
  return Math.floor(Math.random() * (max - min + 1) + min);
}
export function getOnlyUniqueRandomNumbersBetween(num:number){
  const min = 0;
  const max = num;
  const res:any[] = []
  while(res.length < num){
    const random = getRandomNumberBetween(min,max);
    if(!res.includes(random)){
      res.push(random)
    }
  }
  return res;
}
export async function shuffleArray(array:any[]){
  const res = array.sort(() => Math.random() - 0.5);
  return res;
}
//TO DO
function cacheSearchedImages() {}
async function storeImageData(data: PexelPhotoResource, query: string) {
  const localItem: PexelPhotoResult = {
    searchQuery: query,
    width: data.width,
    height: data.height,
    url: data.url,
    alt: data.alt,
    photographer: data.photographer,
    photographerUrl: data.photographer_url,
    avgColor: data.avg_color,
    srcOriginal: data.src.original,
    srcLarge2x: data.src.large2x,
    srcLarge: data.src.large,
    srcMedium: data.src.medium,
    srcSmall: data.src.small,
    srcPortrait: data.src.portrait,
    srcLandscape: data.src.landscape,
    srcTiny: data.src.tiny,
  };

  const existingLocal = getLocalPexelsCache(query);
  if (!existingLocal.find((item) => item.srcOriginal === localItem.srcOriginal)) {
    setLocalPexelsCache(query, [...existingLocal, localItem]);
  }

  try {
    if (shouldSkipPexelsDbAccess()) {
      return;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = nowSeconds + PEXELS_CACHE_TTL_SECONDS;

    await chatDynamoDocumentClient.send(
      new PutCommand({
        TableName: APP_CACHE_TABLE_NAME,
        Item: {
          PK: buildPexelsCachePk(query),
          SK: buildPexelsCacheSk(data.src.original),
          cacheType: "pexels_image",
          searchQuery: query,
          width: data.width,
          height: data.height,
          url: data.url,
          alt: data.alt,
          photographer: data.photographer,
          photographerUrl: data.photographer_url,
          avgColor: data.avg_color,
          srcOriginal: data.src.original,
          srcLarge2x: data.src.large2x,
          srcLarge: data.src.large,
          srcMedium: data.src.medium,
          srcSmall: data.src.small,
          srcPortrait: data.src.portrait,
          srcLandscape: data.src.landscape,
          srcTiny: data.src.tiny,
          createdAt: new Date().toISOString(),
          ttl,
        },
      })
    );
  } catch (error) {
    disablePexelsDbAccess(error);
    // Continue without storing - non-critical operation
  }
}
async function checkForStoredImages(query: string) {
  const localImages = getLocalPexelsCache(query);
  if (localImages.length > 0) {
    return localImages;
  }

  try {
    if (shouldSkipPexelsDbAccess()) {
      return [];
    }
    const result = await chatDynamoDocumentClient.send(
      new QueryCommand({
        TableName: APP_CACHE_TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": buildPexelsCachePk(query),
        },
      })
    );

    const storedImages = (result.Items ?? []) as PexelPhotoResult[];
    if (storedImages.length > 0) {
      setLocalPexelsCache(query, storedImages);
    }
    return storedImages;
  } catch (error) {
    disablePexelsDbAccess(error);
    return [];
  }
}
async function mapPexelImagesToNewObjectArray(images:PexelPhotoResource[],query:string){
  const res = images.map((image:PexelPhotoResource) => {
    return {
      searchQuery: query,
      width: image.width,
      height: image.height,
      url: image.url,
      alt: image.alt,
      photographer: image.photographer,
      photographerUrl: image.photographer_url,
      avgColor: image.avg_color,
      srcOriginal: image.src.original,
      srcLarge2x: image.src.large2x,
      srcLarge: image.src.large,
      srcMedium: image.src.medium,
      srcSmall: image.src.small,
      srcPortrait: image.src.portrait,
      srcLandscape: image.src.landscape,
      srcTiny: image.src.tiny,
    }
  })
  setLocalPexelsCache(query, res);
  return res;
}
export default async (
  numImages: number,
  query: string,
  color?: string,
  orientation: string = "landscape",
  size: string = "medium"
) => {
  let photoResults: any = [];
  //check if images are stored in db
  const storedImages = await checkForStoredImages(query);
  if (storedImages.length > 0) {
    const numImagesFound = storedImages.length;
    console.log(`${numImagesFound} images found in db`);
    if(numImagesFound < (numImages * 2)){
      console.log('need more images...')
    }else{
      const res = []
      for(let i = 0; i < numImages; i++){
        const randomIndex = getRandomNumberBetween(0,storedImages.length - 1)
        res.push(storedImages[randomIndex])
      }
      return res;
    }
   
  }
  //if not, retrieve from pexels

  const client = createClient(process.env.PEXELS_API_KEY || "");

  await client.photos
    .search({
      query,
      per_page: numImages,
      orientation: orientation,
      size: size,
      color: color,
      locale: "en-US",
      page: getRandomNumberBetween(1, 10)
    })
    .then(async (photos) => {
      photoResults = photos;
      await Promise.all(
        photoResults.photos.map(async (photo: PexelPhotoResource) => {
          await storeImageData(photo, query);
        })
      )
    })
    .catch((err) => console.log(err));
  console.log(photoResults.photos.length + " images retrieved");
const res = await mapPexelImagesToNewObjectArray(photoResults.photos,query);
  return res;
};
