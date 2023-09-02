import axios from "axios";

export async function getVTGShipData(params: any) {
    console.log(params)
   
    
    const response = await axios.post("/api/vtgTrip", {
      data: params,
    });
    // console.log(response.data);
    // return response.data;
    
  }
  