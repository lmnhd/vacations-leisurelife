import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // const { userId } = auth();
    const body = await req.json();
    //const { data } = body;
    console.log(body);

    
    const response = await prismadb.preRegisterForm.create({
      data: {
        tripName: "School Daze Cruise",
        partyName: body.partyName,
        numCabins: body.cabinsInParty,
        cabins: {
           create: body.cabins.map((cabin:any) => {
            return {
                
                cabinType: cabin.cabinType,
                numPassengers: cabin.numPassengers,
                passengers: {
                    create: cabin.passengers.map((passenger:any) => {
                      return {
                        paxType: passenger.paxType,
                        firstName: passenger.firstName,
                        middleName: '',
                        lastName: passenger.lastName,
                        gender: passenger.gender,
                        dob: passenger.dob,
                        age: 0,
                        email: passenger.email,
                        phone: passenger.phone,
                        school: passenger.school,
                        city: passenger.city,
                        state: passenger.state,
                        country: 'US',
                        zip: passenger.zip,
                        address: '',
                        contactMethod: passenger.method,
                        loyaltyNum: passenger.loyalty
                      }

                    })
                }
            }
           })
        }
    }})
    console.log(response);

    return NextResponse.json(response);
  } catch (error) {
    console.log("[CODE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
