"use client";
import React, { useState } from "react";
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
          firstName: z.string({
            required_error: "First name is required",
            invalid_type_error: "First name must be a string",
          }),
          lastName: z.string({required_error: "Last name required"}).min(2).max(50),
          email: z.string().email(),
          phone: z.string(),
          school: z.string().optional(),
          city: z.string().min(2).max(50).optional(),
          state: z.string().min(2).max(50).optional(),
          zip: z.string().min(5).max(5).optional(),
          method: z.string(),
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
  const [partyNameVisible, setPartyNameVisible] = useState(false);
  const maxCabins = 4;
  const form = useForm<PreRegisterForm2Values>({
    mode: "onChange",
    resolver: zodResolver(schema),
    shouldUseNativeValidation: true,
    defaultValues: {
      partyName: "",
      cabinsInParty: 1,
      cabins: [
        {
          cabinType: "interior",
          numPassengers: 1,
          passengers: [
            {
              id: "1",
              paxType: "adult",
              firstName: "",
              lastName: "",
              email: "",
              phone: "",
              school: "",
              city: "",
              state: "",
              zip: "",
              method: "email",
            },
          ],
        },
      ],
    },
  });

  const { register, handleSubmit, reset, getValues, control, formState } = form;
  const { errors } = formState;
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
    
  });


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
        appendCabin({
          cabinType: "interior",
          numPassengers: 1,
          passengers: [
            {
              id: currentCabinCount + 1 + i + "",
              paxType: "adult",
              firstName: "",
              lastName: "",
              email: "",
              phone: "",
              school: "",
              city: "",
              state: "",
              zip: "",
              method: "email",
            },
          ],
        },{shouldFocus: true});
      }
    } else if (value < currentCabinCount) {
      const diff = currentCabinCount - value;
      for (let i = 0; i < diff; i++) {
        removeCabin(currentCabinCount - 1);
      }
    }
    //field.onChange(value);
  }

  function onSubmit(data: FieldValues) {
    console.log("FORM SUBMITTED: ", data);
    console.log("Form Values: ", form.getValues());
   

  }
  //function renderCabins() {}
  console.log(form.getValues());
  return (
    <div className="flex flex-col flex-wrap items-center justify-center bg-slate-800  w-full h-full pt-10 py-20">
      <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="pt-5 gap-4 items-center mx-auto justify-center h-full "
        >
          {/* // Party Section  */}
          <div
            //onFocus={}
            className="flex flex-col items-center justify-center"
            onMouseEnter={() => {
              setPartyNameVisible(true);
            }}
            onBlur={() => {
              setPartyNameVisible(false);
            }}
          >
            <div className="flex flex-col bg-white/10 mt-4  items-end justify-around partyName-section p-4 rounded-sm transition-all duration-300 ease-in-out hover:bg-black/10 hover:shadow-lg hover:scale-110">
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
                <p className="text-lg font-medium text-blue-100 text-center">
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
                  <FormItem className="w-72 text-center">
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
                    // className="w-72 text-center"
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
            
            />
          )}
          <Button 
          className="w-full "
          type="submit" 
          disabled={!form.formState.isValid}
          >
            Submit
          </Button>
          {errors.root && <p>{errors.root?.message}</p>}
        </form>
        <DevTool control={control} />
      </Form>
    </div>
  );
}
