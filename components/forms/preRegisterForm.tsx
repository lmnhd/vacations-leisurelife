"use client";
import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import { Input } from "@/components/ui/input";
import { useFieldArray, useForm } from "react-hook-form";
import { type } from "os";

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

const PassengerSchema = z.object({
  pax: z.enum(["adult", "child"]),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  city: z.string(),
  state: z.string(),
  school: z.string().optional(),
  contactMethod: z.enum(["email", "phone", "text"]),
  needAir: z.boolean().default(false),
  needHotel: z.boolean().default(false),
  needTransit: z.boolean().default(false),
  needInsurance: z.boolean().default(false),
  docType: z.enum(["passport", "birth certificate", "state ID", "other"]),
  extraAmenities: z.array(z.string()).optional(),
  specialNeeds: z.array(z.string()).optional(),
});
const CabinSchema = z.object({
  cabinType: z.enum(["interior", "oceanview", "balcony", "suite"]),
  numPassengers: z.number().default(2),
  // passengers: z.array(PassengerSchema).nonempty(),
});
const PreRegisterFormSchema = z.object({
  partyName: z
    .string()
    .min(6, { message: "Party name must be at least 6 characters long" }),
  cabinsInParty: z
    .number()
    .min(1, { message: "at least one cabin must be selected" })
    .max(4, { message: "no more than 4 cabins can be selected" })
    .default(1),
  cabins: z.array(CabinSchema).nonempty(),
});
type PreRegisterFormValues = z.infer<typeof PreRegisterFormSchema>;
type CabinValues = z.infer<typeof CabinSchema>;
type PassengerValues = z.infer<typeof PassengerSchema>;

export default function PreRegisterForm() {
  const maxCabins = 4;
  const form = useForm<z.infer<typeof PreRegisterFormSchema>>({
    //resolver: zodResolver(PreRegisterFormSchema),
    mode: "onTouched",

    defaultValues: {
      partyName: "",
      cabinsInParty: 1,
      cabins: [
        {
          cabinType: "interior",
          numPassengers: 1,
        //   passengers: [
        //     {
        //       pax: "adult",
        //       firstName: "",
        //       lastName: "",
        //       email: "",
        //       phone: "",
        //       city: "",
        //       state: "",
        //       school: "",
        //       contactMethod: "email",
        //       needAir: false,
        //       needHotel: false,
        //       needTransit: false,
        //       needInsurance: false,
        //       docType: "passport",
        //       extraAmenities: [],
        //       specialNeeds: [],
        //     },
        //   ],
        },
      ],
    },
  });
  
  const {
     register,
     handleSubmit, 
     reset, 
     getValues, 
     control, 
     formState } = form;
  const { errors } = formState;
   
    function addCabin() {
      

      form.setValue("cabinsInParty", form.getValues("cabinsInParty") + 1);
    //   update(0, [...getValues("cabins"), { cabinType: "interior", numPassengers: 1 }])
    //   form.setValue("cabins", [
    //     ...getValues("cabins"),
    //       {
    //           cabinType: "interior",
    //           numPassengers: 1,
    //         //   passengers: [
    //         //   {
    //         //       pax: "adult",
    //         //       firstName: "",
    //         //       lastName: "",
    //         //       email: "",
    //         //       phone: "",
    //         //       city: "",
    //         //       state: "",
    //         //       school: "",
    //         //       contactMethod: "email",
    //         //       needAir: false,
    //         //       needHotel: false,
    //         //       needTransit: false,
    //         //       needInsurance: false,
    //         //       docType: "passport",
    //         //       extraAmenities: [],
    //         //       specialNeeds: [],
    //         //   },
    //         //   ],
    //       },
    //   ]);
      console.log(form.getValues("cabins"));
    }
    function removeCabin() {
        
      form.setValue("cabinsInParty", form.getValues("cabinsInParty") - 1);
      const newCabins = form.getValues("cabins").slice(0, -1);
        // update(0, newCabins);
    //   form.setValue("cabins", form.getValues("cabins").slice(0, -1) as any);
      console.log(form.getValues("cabins"));
    }
    function updateCabins(value: any, field: any) {

      if (value === "") return;
      if (value < 1) return;
      if (value > maxCabins) return;
      console.log(value);

      //form.setValue("cabinsInParty", value);
      const currentCabins = form.getValues("cabins");
      const currentCabinCount = currentCabins?.length || 1;
      if (value > currentCabinCount) {
        const diff = value - currentCabinCount;
        for (let i = 0; i < diff; i++) {
          addCabin();
        }
      } else if (value < currentCabinCount) {
        const diff = currentCabinCount - value;
        for (let i = 0; i < diff; i++) {
          removeCabin();
        }
      }
      //field.onChange(value);

    }
  function onSubmit(data: z.infer<typeof PreRegisterFormSchema>) {
    console.log(data);
  }
  console.log(PreRegisterFormSchema.safeParse(form.getValues()));
  return (
    <div>
      <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-8 text-slate-800"
        >
          <FormField
            //control={form.control}
            name="partyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="partyName">Party Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="partyName"
                    placeholder="Name of Party"
                    {...register("partyName", {
                        required: "Party name is required",
                        minLength: {
                            value: 6,
                            message: "Party name must be at least 6 characters long",
                        },
                        })
                    }
                   
                  />
                </FormControl>
                <FormDescription>
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
              <FormItem>
                <FormLabel htmlFor="cabinsInParty">
                  Number of Cabins in Party
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="cabinsInParty"
                    type="number"
                    placeholder="Number of Cabins"
                    {...register("cabinsInParty", {
                        required: "Number of cabins is required",
                        min: {
                            value: 1,
                            message: "at least one cabin must be selected",
                        },
                        max: {
                            value: 4,
                            message: "no more than 4 cabins can be selected",
                        },
                        })
                    }
                    
                    onChange={(e) => {
                      updateCabins(Number(e.target.value), field);
                      //field.onChange(e);
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
          {form.getValues("cabins") && (
            <div className="flex justify-between space-x-4">
              {form.getValues("cabins").map((cabin, cabinIndex) => {
                return (
                  <div key={cabinIndex}>
                    <h2 className="text-white">Cabin {cabinIndex + 1}</h2>
                    <FormField
                      //control={form.control}
                      name={`cabins[${cabinIndex}].cabinType`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel
                            htmlFor={`cabins[${cabinIndex}].cabinType`}
                          >
                            Cabin Type
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              id={`cabins[${cabinIndex}].cabinType`}
                              placeholder="Cabin Type"
                            />
                          </FormControl>
                          <FormDescription>
                            The type of cabin you would like to reserve.
                          </FormDescription>
                          <FormMessage>
                            {errors.cabins?.[cabinIndex]?.cabinType?.message}
                          </FormMessage>
                        </FormItem>
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <Button type="submit">Submit</Button>
        </form>
      </Form>
    </div>
  );
}
