import React from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import Stepper from "./input/stepper";
import Passengers, { Passenger, ContactMethod, PaxType } from "./passengers";
import {
  Control,
  FieldArrayWithId,
  FieldErrors,
  UseFormRegister,
  UseFormReturn,
} from "react-hook-form";
import { PreRegisterForm2Values } from "./preRegisterForm2";

interface Cabin {
  id: string;
  // Add any other properties here
}
export default function Cabins({
  cabinFields,
  form,
  register,
  errors,
  control,
}: {
  cabinFields: any;
  form: any;
  register: any;
  errors: any;
  control:any;
}) {
  const { getValues } = form;
  return (
    <Tabs defaultValue="cabin1">
      <TabsList className="grid grid-flow-col w-full justify-start items-start bg-transparent">
      {cabinFields.map((cabin: any, cabinIndex: number) =>{
        return <TabsTrigger key={`cabin${cabinIndex + 1}`} value={`cabin${cabinIndex + 1}`}>Cabin {cabinIndex+1}</TabsTrigger>
      })}
      </TabsList>
      <div className="flex flex-wrap items-center my-10 border-t-2 border-gray-500/20 py-5 justify-center gap-4">
        {cabinFields.map((cabin: Cabin, cabinIndex: number) => {
          return (
            <TabsContent key={`cabin${cabinIndex + 1}`}  value={`cabin${cabinIndex + 1}`}>
              <div key={cabin.id} className="h-64 ">
                
                <div className="flex flex-row flex-wrap items-stretch gap-10 justify-around cabin-wrapper">
                  <div className="cabin-console-wrapper">
                    <FormField
                      name={`cabins.${cabinIndex}.cabinType`}
                     control={control}
                     key={`cabins.${cabinIndex}.cabinType`}
                     defaultValue="interior"

                      render={({ field, fieldState, formState }) => (
                        <FormItem>
                          <FormLabel
                            className="text-white/50"
                            //htmlFor={`cabins.${cabinIndex}.cabinType`}
                          >
                            Cabin Type
                          </FormLabel>
                          <FormControl>
                            <Select
                              {...field}
                              {...fieldState}
                              {...formState}
                              value={form.getValues(
                                `cabins.${cabinIndex}.cabinType`
                              )}
                              
                             
                              onValueChange={(value) => {
                                form.setValue(
                                  `cabins.${cabinIndex}.cabinType`,
                                  value,
                                  {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                    
                                  }
                                );
                                console.log(
                                  `cabins.${cabinIndex}.cabinType`,
                                  value
                                );
                              }}
                              {...register(`cabins.${cabinIndex}.cabinType`)}
                              
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Cabin Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="interior">
                                    Interior
                                  </SelectItem>
                                  <SelectItem value="oceanview">
                                    Ocean View
                                  </SelectItem>
                                  <SelectItem value="balcony">
                                    Balcony
                                  </SelectItem>
                                  <SelectItem value="suite">Suite</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            
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
                    <FormField
                      name="numPassengers"
                      render={({ field }) => (
                        <FormItem className="text-white/50 text-center">
                          <FormLabel htmlFor="numPassengers">
                            Number of Passengers
                          </FormLabel>
                          <FormControl>
                            <Stepper
                              CurrentValue={getValues(
                                `cabins.${cabinIndex}.numPassengers`
                              )}
                              MaxValue={4}
                              MinValue={1}
                              onChange={(value) => {
                                form.setValue(
                                  `cabins.${cabinIndex}.numPassengers`,
                                  value
                                );
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            The number of passengers in your party
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* <Passengers
                    cabinIndex={cabinIndex}
                    control={control}
                    register={register}
                    numPassengers={getValues(
                      `cabins.${cabinIndex}.numPassengers`
                    )}
                    form={form}
                    errors={errors}
                  /> */}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </div>
    </Tabs>
  );
}
