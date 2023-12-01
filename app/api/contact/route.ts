import { NextResponse } from "next/server";

import prismadb from "@/lib/prismadb";
import { absoluteUrl } from "@/lib/utils";
import { PreRegisterForm2Values } from "@/components/forms/preRegisterForm2";
//import { Resend } from "resend";

import { sendAdminPushNotification } from "@/lib/pushover";
//import SchooldazeRegisterThankyou, { SchoolDazeRegisterEmailProps } from "@/emails/thankyou-register";





//const resend = new Resend(process.env.RESEND_API_KEY);

const formatPrice = (price: number) => {
  return (price / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
};

const retrieveCustomer = async (passenger: any, cabin: any) => {
  const passengerOne = await prismadb.schoolDazePassenger.findFirst({
    where: {
      email: passenger.email,
    },
    select: {
      email: true,
      id: true,
      //cabinFormId: true,
    },
  });
  if (passengerOne) {
    //add cabin to passengerOne cabin list
    const updatedCustomer = await prismadb.schoolDazePassenger.update({
      where: {
        id: passengerOne.id,
      },
      data: {
        sdcabins: {
          connect: {
            id: cabin.id,
          },
        },
      },
    });
  }
  return passengerOne ? passengerOne : createCustomer(passenger, cabin);
};
const createBooking = async (body: any) => {
  const newBooking = await prismadb.schoolDazeRegisterForm.create({
    data: {
      partyName: body.cabins[0].passengers[0].lastName,
      numCabins: 1,
      tripName: "School Daze Cruise",
    },
  });
  return newBooking;
};

const createCustomer = async (passenger: any, cabin: any) => {
  const dob = new Date(passenger.dob).toISOString()
  
  const newPassenger = await prismadb.schoolDazePassenger.create({
    data: {
      paxType: passenger.paxType,
      firstName: passenger.firstName,
      middleName: "",
      email: passenger.email,
      gender: passenger.gender,
      dob: dob,
      contactMethod: passenger.method,
      lastName: passenger.lastName,
      phone: passenger.phone,

      city: passenger.city,
      state: passenger.state,
      country: "US",
      zip: passenger.zip,
      loyaltyNum: passenger.loyalty,
      school: passenger.school,
      //cabinFormId: cabin.id,
      sdcabins: {
        connect: {
          id: cabin.id,
        },
      },
    },
  });
  return newPassenger;
};
const createCabin = async (cabin: any, form: any) => {
  const newCabin = await prismadb.schoolDazeCabinForm.create({
    data: {
      cabinType: cabin.cabinType,
      cabinPrice: cabin.cabinPrice,
      numPassengers: cabin.numPassengers,
      ccNumber: cabin.ccNumber,
      ccExp: cabin.ccExp,
      ccCvv: cabin.ccCvv,
      ccZip: cabin.ccZip,
      ccName: cabin.ccName,
      preRegisterForm: {
        connect: {
          id: form.id,
        },
      },
    },
  });
  console.log("line 72 - newCabin = ", newCabin);
  return newCabin;
};
export async function POST(req: Request) {
  
  const body = await req.json();
  console.log("line 78 - body = ", body);

  //return new NextResponse("complete", { status: 200 })

  const email = body.email || "";
  const firstName = body.firstName;
  const lastName = body.lastName;
  const contactMethod = body.contactMethod;
  const phone = body.phone || "";
  const comments = body.comments || "";
  
  
  

  try {
    

    const client = await prismadb.registerShort.create({
      data: {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: phone,
        contactMethod: contactMethod,
        comments: comments,
        password: "password",
        
      },
    });
    


   return new NextResponse("complete", { status: 200 })
  } catch (error: any) {
    console.error("[DB_ERROR]", error);
    sendAdminPushNotification( `DB_ERROR_153 : ${error.message}`)
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
