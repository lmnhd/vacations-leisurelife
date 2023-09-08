import { createClient } from "pexels";

export default async (
  numImages,
  query,
  color = null,
  orientation = "landscape",
  size = "medium"
) => {
  let photoResults = [];
  const client = createClient(process.env.PEXELS_API_KEY || "");

  await client.photos
    .search({
      query,
      per_page: numImages,
      orientation: orientation,
      size: size,
      color: color,
      locale: "en-US",
      page: 1,
      
    })
    .then((photos) => {
      photoResults = photos;
    })
    .catch((err) => console.log(err));
  console.log(photoResults.photos.length + " images retrieved");

  return photoResults;
};
