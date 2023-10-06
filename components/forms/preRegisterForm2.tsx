"use client";
import React, { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DevTool } from "@hookform/devtools";
import Passengers, { Passenger, ContactMethod, PaxType } from "./passengers";

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
import { Input } from "@/components/ui/input";
import { FieldValues, useFieldArray, useForm } from "react-hook-form";
import { type } from "os";
import Stepper from "./input/stepper";
import Cabins from "./cabins";
import axios from "axios";

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
  partyName: z.string().min(5).max(20),
  cabinsInParty: z.number().min(1).max(4).default(1),
  cabins: z.array(
    z.object({
      cabinType: z.string(),
      numPassengers: z.number().min(1).max(4),
      passengers: z.array(
        z.object({
          id: z.string(),
          paxType: z.string().optional(),
          firstName: z
            .string({
              required_error: "First name is required",
              invalid_type_error: "First name must be a string",
              coerce: true
            })
            .min(2)
            .max(50),
          lastName: z
            .string({ required_error: "Last name required" })
            .min(2)
            .max(50),
            gender: z.enum(['male','female'] as const),
            dob: z.coerce.date(),
          email: z.string().email(),
          phone: z.string().min(10),
          school: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
          method: z.string(),
          loyalty: z.string().optional(),
        })
      ),
    })
  ),
});
export type PreRegisterForm2Values = z.infer<typeof schema>;
// export type PreRegisterForm2Values = {
//   partyName: string;
//   cabinsInParty: number;
//   cabins: {
//     cabinType: string;
//     numPassengers: number;
//     passengers: Passenger[];
//   }[];
// };

export default function PreRegisterForm2() {
  const [partyNameVisible, setPartyNameVisible] = useState(true);
  const maxCabins = 4;
  const [formComplete, setFormComplete] = useState(false);
  //const [formErrors, setFormErrors] = useState<any[]>([]);
  const cabinTypes = [
    { name: "Interior Bella -$199", value: "interior_bella" },
    { name: "Deluxe Interior -$229", value: "deluxe_interior" },
    { name: "Ocean View Bella -$259", value: "ocean_view_bella" },
    { name: "Deluxe Ocean View -$279", value: "deluxe_ocean_view" },
    { name: "Balcony Bella -$319", value: "balcony_bella" },
    { name: "Deluxe Balcony -$359", value: "deluxe_balcony" },
    
  ]
  
  const form = useForm<PreRegisterForm2Values>({
    mode: "onChange",
    resolver: zodResolver(schema),

    defaultValues: {
      partyName: "",
      cabinsInParty: 1,
      cabins: [
        {
          cabinType: cabinTypes[0].value ,
          numPassengers: 2,
          passengers: [
            {
              id: "1",
              paxType: "adult",
              firstName: "",
              lastName: "",
              //gender: "",
              dob: new Date(),

              email: "",
              phone: "",
              school: "",

              city: "",
              state: "",
              zip: "",
              method: "email",
              loyalty: "",
            },
            {
              id: "2",
              paxType: "adult",
              firstName: "",
              lastName: "",
              //gender: "",
              dob: new Date(),

              email: "",
              phone: "",
              school: "",

              city: "",
              state: "",
              zip: "",
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
  // const result = schema.safeParse(form.getValues());
  // console.log(result);
  // const formErrors = result.success ? [] : result.error.issues;
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
                dob: new Date(),

                email: "",
                phone: "",
                school: "",

                city: "",
                state: "",
                zip: "",
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
    console.log("FORM SUBMITTED: ", data);
    console.log("Form Values: ", form.getValues());
    const response = await axios.post("/api/preregister", data);
    console.log(response.data)
    setFormComplete(true);
  }
  //function renderCabins() {}
  console.log(form.getValues());
  return (
    <div className="flex flex-col flex-wrap items-center justify-center w-full py-20 pt-10 bg-black">
      {!formComplete && <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="items-center justify-center h-full gap-4 pt-1 mx-auto "
        >
          {/* // Party Section  */}
          <div
            //onFocus={}
            className="flex flex-col items-center justify-center h-40 mb-14"
            // onMouseEnter={() => {
            //   setPartyNameVisible(true);
            // }}
            // onBlur={() => {
            //   setPartyNameVisible(false);
            // }}
          >
            <div className="flex flex-col items-end justify-around p-4 mt-4 transition-all duration-300 ease-in-out rounded-sm bg-white/10 partyName-section hover:bg-black/10 hover:shadow-lg hover:scale-110">
              <div
                className={`mx-auto text-2xl font-semibold text-blue-300 text-center ${
                  partyNameVisible ? "hidden" : ""
                }`}
              >
                <p>
                  {getValues("partyName") !== ""
                    ? `${getValues("partyName")} Party`
                    : "Please Enter Name of Party"}
                </p>
                <p className="text-lg font-medium text-center text-blue-100">
                  {getValues("partyName") !== ""
                    ? `${getValues("cabinsInParty")} ${
                        getValues("cabinsInParty") > 1 ? "Cabins" : "Cabin"
                      }`
                    : ""}
                </p>
              </div>
              <FormField
                //control={form.control}

                name="partyName"
                render={({ field }) => (
                  <FormItem className="text-center w-72">
                    <FormLabel
                      htmlFor="partyName"
                      className={`${
                        partyNameVisible ? "" : "hidden"
                      } text-white `}
                    >
                      Party Name
                    </FormLabel>
                    <FormControl
                      className={`${partyNameVisible ? "" : "hidden"} `}
                    >
                      <Input
                        {...field}
                        id="partyName"
                        placeholder="Name of Party"
                        className="h-5"
                        {...register("partyName", {
                          required: "Party name is required",
                          minLength: {
                            value: 6,
                            message:
                              "Party name must be at least 6 characters long",
                          },
                        })}
                      />
                    </FormControl>
                    <FormDescription
                      className={`${partyNameVisible ? "" : "hidden"} `}
                    >
                      The name to be used for your party. Can be your last name.
                    </FormDescription>
                    <FormMessage>{errors.partyName?.message}</FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                //control={form.control}
                name="cabinsInParty"
                render={({ field }) => (
                  <FormItem
                    className={`${
                      partyNameVisible ? "" : "hidden"
                    } "w-72 text-center `}
                    // className="text-center w-72"
                  >
                    <FormLabel className="text-white" htmlFor="cabinsInParty">
                      Cabins
                    </FormLabel>
                    <FormControl>
                      <Stepper
                        CurrentValue={getValues("cabinsInParty") || 1}
                        MaxValue={4}
                        MinValue={1}
                        onChange={(value) => {
                          updateCabins(value, field);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      The number of cabins in your party. (Max {maxCabins})
                    </FormDescription>
                    <FormMessage>{errors.cabinsInParty?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </div>
          </div>
          {/* // Cabins Section */}
          {cabinFields && (
            <Cabins
              cabinFields={cabinFields}
              control={control}
              errors={errors}
              form={form}
              register={register}
              cabinTypes={cabinTypes}
            />
          )}
          <div className="group ">
          <Button
            className="w-full "
            type="submit"
            disabled={!form.formState.isValid}
          >
            Sign me up!
          </Button>
          <div className="text-xs text-red-500 opacity-0 group-hover:opacity-100"> {formErrors.map((err, index) => {
            return <p className="" key={`${err.path}${index}`}>
              {String(err.path[0])?.replace('cabins','cabin')} {String(Number(err.path[1]) +1).replaceAll('NaN','').replaceAll('undefined','')} {String(err.path[2])?.replace('passengers','passenger').replaceAll('undefined','')} {String(Number(err.path[3]) +1).replaceAll('NaN','').replaceAll('undefined','')} {String(err.path[4])?.replace('dob','date of birth').replaceAll('undefined','')}...{err.message}</p>
          })}</div>
          </div>
          
         
          {/* {errors.root && <p className="text-white">{errors.root?.message}</p>} */}
        </form>
        {/* <DevTool control={control} /> */}
      </Form>}
      {formComplete && <div className="flex flex-col items-center justify-center w-full h-full gap-4 pt-1 mx-auto ">
        <p className="text-4xl text-white">Thank you! We have received your request.</p>
        </div>}
    </div>
  );
}
