"use client";
import React, { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { CabinPrices, absoluteUrl, cabinTypes, cn, depositAmount, getPhoneNumber } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";


import { Input } from "@/components/ui/input";
import { FieldValues, useFieldArray, useForm } from "react-hook-form";
import { type } from "os";
import Stepper from "./input/stepper";
import Cabins from "./cabins";
import axios, { Axios, AxiosError } from "axios";
import { formatPrice } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";
import Link from "next/link";
import AboutPaymentsPopup from "./aboutpaymentspopup";


// Party name
// # Cabins in party
// Preferred Cabin Types

// # Passengers per cabin

// Adult/Child?
// Name
// Email
// Phone number
// City and State
// Representing School?
// Preferred Contact Method
// ***
// Air Accommodations?
// Hotel Accommodations?
// Transit/Shuttle?
// Insurance?
// Doc Type?
// Upgrades/Amenities?
// Special needs?
const schema = z.object({
  partyName: z.string().optional(),
  cabinsInParty: z.number().min(1).max(4).default(1),
  cabins: z.array(
    z.object({
      cabinType: z.string(),
      cabinPrice: z.number().optional(),
      payNow: z.string().optional(),
      payNowPrice: z.number().optional(),
      numPassengers: z.number().min(1).max(4),
      ccNumber: z.string().optional(),
          ccExp: z.string().optional(),
          ccCvv: z.string().max(19).optional(),
          ccName: z.string().optional(),
          ccZip: z.string().optional(),
          ccFocus: z.string().optional(),
      passengers: z.array(
        z.object({
          id: z.string(),
          paxType: z.string().optional(),
          firstName: z
            .string({
              required_error: "First name is required",
              invalid_type_error: "First name must be a string",
              coerce: true,
            })
            .min(2)
            .max(50),
          middleName: z
            .string({
              required_error: "First name is required",
              invalid_type_error: "First name must be a string",
              coerce: true,
            })
            .optional(),
          lastName: z
            .string({ required_error: "Last name required" })
            .min(2)
            .max(50),
          gender: z.enum(["male", "female"] as const),
         //dob: z.coerce.date(),
          dob: z.string(),
          email: z.string().email(),
          phone: z.string().min(10),
          school: z.string().optional(),
          city: z.string().optional(),
          state: z.string().min(2),
          zipCode: z.string().optional(),
          method: z.string(),
          loyalty: z.string().optional(),
          

        })
      ),
    })
  ),
});
export type PreRegisterForm2Values = z.infer<typeof schema>;

export default function PreRegisterForm2({closeButton}:{closeButton:any}) {
  const [partyNameVisible, setPartyNameVisible] = useState(true);
  const [authorizeNow, setAuthorizeNow] = React.useState(false);
  const [llvPhone, setLLVPhone] = useState("");
  const maxCabins = 4;
  const [formComplete, setFormComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  //const [formErrors, setFormErrors] = useState<any[]>([]);

  useEffect(() => {
    async function getLLVPhone() {
      const res = await axios.get("/api/serverutils/LLV_PHONE");
      setLLVPhone(res.data);
    }
    getLLVPhone();
  }, []);

  const form = useForm<PreRegisterForm2Values>({
    mode: "onChange",
    resolver: zodResolver(schema),

    defaultValues: {
      partyName: "",
      cabinsInParty: 1,
      cabins: [
        {
          cabinType: cabinTypes[0].value,
          cabinPrice: CabinPrices.interior_bella,
          payNow: "deposit_only",
          payNowPrice: depositAmount,
          numPassengers: 2,
          ccNumber: "",
          ccExp: "",
          ccCvv: "",
          ccName: "",
          ccZip: "",
          passengers: [
            {
              id: "1",
              paxType: "adult",
              firstName: "",
              lastName: "",
              //gender: "",
              dob: new Date('1980-01-01').toISOString().substring(0, 10),

              email: "",
              phone: "",
              school: "",

              city: "",
              state: "",
              zipCode: "",
              method: "email",
              loyalty: "",
            },
            {
              id: "2",
              paxType: "adult",
              firstName: "",
              lastName: "",
              //gender: "",
              dob: new Date('1980-01-01').toISOString().substring(0, 10),

              email: "",
              phone: "",
              school: "",

              city: "",
              state: "",
              zipCode: "",
              method: "email",
              loyalty: "",
            },
          ],
        },
      ],
    },
  });

  const { register, handleSubmit, reset, getValues, control, formState } = form;
  const { errors } = formState;
  // useEffect(() => {
  //   console.log("FORM STATE CHANGED", formState);
  //   const result = schema.safeParse(form.getValues());
  // console.log(result);
  // const fe = result.success ? [] : result.error.issues;

  // }, []);
  const {
    fields: cabinFields,
    append: appendCabin,
    prepend: prependCabin,
    remove: removeCabin,
    swap: swapCabin,
    move: moveCabin,
    insert: insertCabin,
  } = useFieldArray({
    control,
    name: "cabins",
    shouldUnregister: false,
  });

  const result = schema.safeParse(form.getValues());
  console.log(result);
  const fe = result.success ? [] : result.error.issues;
  const formErrors = fe;

  function updateCabins(value: any, field: any) {
    if (value === "") return;
    if (value < 1) return;
    if (value > maxCabins) return;
    console.log(value);

    form.setValue("cabinsInParty", value);
    const currentCabins = form.getValues("cabins");
    const currentCabinCount = currentCabins?.length || 1;
    if (value > currentCabinCount) {
      const diff = value - currentCabinCount;
      for (let i = 0; i < diff; i++) {
        //addCabin();
        appendCabin(
          {
            cabinType: "interior",
            numPassengers: 1,
            passengers: [
              {
                id: currentCabinCount + 1 + i + "",
                paxType: "adult",
                firstName: "",
                lastName: "",
                gender: "male",
                dob: new Date('1980-01-01').toISOString().substring(0, 10),

                email: "",
                phone: "",
                school: "",

                city: "",
                state: "",
                zipCode: "",
                method: "email",
                loyalty: "",
              },
            ],
          },
          { shouldFocus: true }
        );
      }
    } else if (value < currentCabinCount) {
      const diff = currentCabinCount - value;
      for (let i = 0; i < diff; i++) {
        removeCabin(currentCabinCount - 1);
      }
    }
    //field.onChange(value);
  }

  async function onSubmit(data: z.infer<typeof schema>) {
    //TODO: setup loading state
    // toast("Standby for payment processing page...", {
    //   position: "bottom-center",
    // });
    setLoading(true);
    console.log("FORM SUBMITTED: ", data);
    console.log("Form Values: ", form.getValues());
    try {
      await axios.post("/api/stripe", data).then((res) => {
        
        //window.location.href = res.data.url;
        console.log(res.data);
         setFormComplete(true);
        setLoading(false)
      });
    } catch (error: any) {
      console.log("error = ", error);
      setLoading(false)
      if (error.response.status === 201) {
        console.log("email already exists");
        toast(error.response.data + ` For assistance, please call ${llvPhone}`);
        //window.alert(res.data + ` For assistance, please call ${llvPhone}`);
        //setFormErrors(res.data)
        return;
      }
      if (error.response.status === 400) {
        console.log("error");
        toast.error(
          error.response.data + ` For assistance, please call ${llvPhone}`
        );
        //window.alert(res.data + ` For assistance, please call ${llvPhone}`);
        //setFormErrors(res.data)
        return;
      }

      if (error.response.status === 500) {
        console.log("error");
        toast.dismiss();
        toast.error(
          error.response.data + `For assistance, please call ${llvPhone}`,
          { duration: 200000 }
        );
        //window.alert(error.response.data + ` For assistance, please call ${llvPhone}`);
        //setFormErrors(res.data)
        return;
      }
    }
  }

  console.log(form.getValues());
  return (
    <>
      <div className="flex flex-col h-screen md:h-auto? overflow-auto flex-wrap items-center justify-center w-full my-20 md:my-1 py-20 pt-10 bg-gradient-to-br from-slate-900 via-violet-950 to-gray-900 mix-blend-screen ">


       {loading && <div className="flex items-center bg-black/0 w-screen h-screen absolute justify-center text-2xl text-white opacity-50?  transition-all duration-500 ease-in-out hover:opacity-100 ">
        <p
          className="z-50 w-1/2 text-4xl font-bold text-center text-white"
          >MAKING BOOKING REQUEST...</p>
        {/* <p
          className="z-50 w-1/2 text-4xl font-bold text-center text-white"
          >PLEASE STANDBY FOR PAYMENT PROCESSING PAGE...</p> */}

          <div className="flex justify-center items-center bg-green-900/80? h-screen w-screen  absolute blur-3xl transition-all duration-500 ease-in-out ">

         
          </div>
          
        </div>}
        {!formComplete && (
          <Form {...form}>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className={`items-center justify-center transition-all duration-500 ease-in-out h-full gap-4 pt-1 px-3 mx-auto mt-20  ${loading && "blur-xl"} `}
            >
              {/* // Party Section  */}

              {/* // Cabins Section */}
              <div
                className={`p-1 rounded-sm ${
                  form.formState.isValid
                    ? "bg-gradient-to-bl from-green-800/80 via-green-700/50 to-green-700 text-green-200"
                    : "bg-black/50 border-[1px] border-[red] border-dotted"
                }`}
              >
                {closeButton}
               <AboutPaymentsPopup/>
                {/* <h2 className="text-2xl text-white"><span>please note: </span>Prices subject to change at MSC&apos;s discretion</h2> */}
                {cabinFields && (
                  <Cabins
                    cabinFields={cabinFields}
                    control={control}
                    errors={errors}
                    form={form}
                    register={register}
                    cabinTypes={cabinTypes}
                    authorizeNow={authorizeNow}
                    setAuthorizeNow={setAuthorizeNow}
                  />
                )}
                <div
                  className={cn(
                    `mb-8 bg-gray-800 p-4 rounded-sm final-price-element `
                  )}
                >
                  {/* //show final price without tax and final price with tax */}
                  <div className="flex flex-col items-start justify-start gap-4 pt-1 mx-auto text-sm tracking-wide ">
                    <div className="flex gap-3">
                      <p className="text-white ">
                        Total Price for Cabin {" : "}
                        <span className="text-green-500">
                          {formatPrice(
                            (form.getValues(`cabins.0.cabinPrice`) || 0) * 2
                          )}
                        </span>
                      </p>
                      <p className="text-red-200 font-extralight">
                        {" * "}  Plus Taxes, Fees, & Port Expenses of $75.00 pp
                      </p>
                    </div>
                    <div className="flex gap-3">
                      {" "}
                      <p className="text-white ">Final Cost With Tax/Fees :</p>
                      <p className="text-green-500">
                        {formatPrice(
                          ((form.getValues(`cabins.0.cabinPrice`) || 0) +
                            7500) * 2
                        )}
                      </p>
                    </div>
                    {authorizeNow && <div className="flex gap-3">
                      <p className="text-white ">Pay Deposit...</p>
                      <span className="text-green-500">
                        {formatPrice(
                          form.getValues(`cabins.0.payNowPrice`) || 0
                        )}
                      </span>
                    </div>}
                  </div>
                </div>
                <div className="group ">
                  <Button
                    className="w-full text-lg font-bold text-orange-300 border-2 border-red-300 bg-gradient-to-br from-black via-gray-800 to-black hover:from-red-500 hover:via-red-400 hover:to-red-500"
                    type="submit"
                    disabled={!form.formState.isValid}
                  >
                    {/* Book and Pay Now */}
                    Register Now
                  </Button>
                  <div className="text-xs text-red-500 transition-all duration-300 ease-in-out opacity-0 md:hidden group-hover:inline-block group-hover:opacity-100">
                    {" "}
                    {formErrors.map((err, index) => {
                      return (
                        <p className="" key={`${err.path}${index}`}>
                          please fix{" "}
                          {/* {String(err.path[0])?.replace("cabins", "cabin")}{" "}
                        {String(Number(err.path[1]) + 1)
                          .replaceAll("NaN", "")
                          .replaceAll("undefined", "")}{" "} */}
                          {String(err.path[2])
                            ?.replace("passengers", "passenger")
                            .replaceAll("undefined", "")}{" "}
                          {String(Number(err.path[3]) + 1)
                            .replaceAll("NaN", "")
                            .replaceAll("undefined", "")}{" "}
                          {String(err.path[4])
                            ?.replace("dob", "date of birth")
                            .replaceAll("undefined", "")}
                          {/* ...{err.message} */}
                        </p>
                      );
                    })}
                  </div>
                </div>
                </div>
                
              
              {/* {errors.root && <p className="text-white">{errors.root?.message}</p>} */}
              {closeButton}
              <div className="opacity-0 h-72">------------------------- </div>
            
            {/* <DevTool control={control} /> */}
            </form>
          </Form>
        )}
        <Toaster />
        {formComplete && (
          <div className="flex flex-col items-center justify-center w-full h-full gap-4 pt-1 mx-auto ">
            <p className="text-2xl text-white">
              Thank you! Your booking will be confirmed within 24hrs.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
