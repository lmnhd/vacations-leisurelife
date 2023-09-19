import React from "react";
import { getGoogleImage } from "@/app/utils/CommonObjects/googleimage";

import Image from "next/image";
import { cbPick } from "./[id]";



export default async function DestinationDealsPage() {
  // const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${id}&q=Celebrity Summit`)
  // const data = await res.json()
  // console.log(data)

  const id = decodeURI('What:7-nightsDiscoveryPrincess-When:%C2%A0June1,8,15,2024(weeklydepartures)')
  console.log(id)
const pick = await cbPick(id)
console.log('FOUND PICK: ',pick)

  // const images = await getGoogleImage("Celebrity Summit",2);
  // console.log(images);
  // const img = images[1];

  return (
    <div>
      {/* <img src={ img.url} alt='celebrity ship' /> */}
    </div>
  );
}
