import React, { useEffect } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import {
  FieldErrors,
  UseFormRegister,
  UseFormReturn,
  useFieldArray,
  Controller,
} from "react-hook-form";

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
import { watch } from "fs";
import { PreRegisterForm2Values } from "./preRegisterForm2";
import "react-phone-number-input/style.css";

export enum PaxType {
  adult,
  child,
}
export enum ContactMethod {
  email,
  phone,
  text,
}
export interface Passenger
  extends Record<string, string | PaxType | ContactMethod> {
  id: string;
  paxType: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  school: string;
  city: string;
  state: string;
  zip: string;
  method: ContactMethod;
}
const PassengerField = ({
  label,
  name,
  description,
  register,
  cabinIndex,
  index,
  rules,
  form,
  item,
  children,
  errors,
}: {
  label: string;
  name: string;
  description: string;
  cabinIndex: number;
  index: number;
  rules?: object;
  form: any;
  item: any;
  register: any;
  children?: React.ReactNode;
  errors: any;
}) => {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel 
          className="text-sm font-medium text-yellow-500"
          htmlFor={name}>{label}</FormLabel>
          <FormControl>
            {children ? (
              children
            ) : (
              <Input
                 className={`h-5`}
                
                {...register(
                  `cabins.${cabinIndex}.passengers.${index}.${name}`,
                  rules
                )}
                ref={null}
                onChange={(e) => {
                  console.log(
                    `cabins.${cabinIndex}.passengers.${index}.${name}`,
                    e.target.value
                  );
                  form.setValue(
                    `cabins.${cabinIndex}.passengers.${index}.${name}`,
                    e.target.value,
                    { shouldValidate: true }
                  );
                }}
              />
            )}
          </FormControl>
          <FormDescription className="text-xs">{description}</FormDescription>
          <FormMessage>
            {errors?.cabins?.[cabinIndex]?.passengers?.[index]?.[name]?.message}
          </FormMessage>
        </FormItem>
      )}
    />
  );
};
export default function Passengers({
  cabinIndex,
  control,
  register,
  numPassengers,
  form,
  errors,
}: any) {
  //console.log(form.getValues());
  const { fields, append, remove } = useFieldArray({
    control,
    name: `cabins.${cabinIndex}.passengers`, // unique name for your Field Array
  });
  const className = "";
  useEffect(() => {
    if (fields.length < numPassengers) {
      addPassenger();
    }
    if (fields.length > numPassengers) {
      removePassenger();
    }
  }, [numPassengers]);
  const addPassenger = () => {
    append({
      id: `${cabinIndex}-${fields.length}`,
      paxType: "adult",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      school: "",
      city: "",
      state: "",
      zip: "",
      method: ContactMethod.email,
    });
  };
  const removePassenger = () => {
    remove(fields.length - 1);
  };
  return (
    <div>
      {fields.map((item, index) => {
        return (
          <div className="flex flex-col h-64 overflow-y-auto" key={item.id}>
            {/* PASSENGER TYPE */}
            <PassengerField
              label="passenger type"
              name={`paxType`}
              description="Is this passenger an adult or a child?"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              rules={{ required: "Pax Type is required" }}
              item={item}
              errors={errors}
            >
              <Select
                //defaultValue={(item as Passenger).paxType}
                onValueChange={(value) => {
                  console.log(value);
                  form.setValue(
                    `cabins.${cabinIndex}.passengers.${index}.paxType`,
                    value,
                    { shouldValidate: true }
                  );
                }}
                value={form.getValues(
                  `cabins.${cabinIndex}.passengers.${index}.paxType`
                )}
                {...register(
                  `cabins.${cabinIndex}.passengers.${index}.paxType`
                )}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="adult">Adult</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </PassengerField>
            {/* FIRST NAME */}
            <PassengerField
              label="first name"
              name={`firstName`}
              description="First name of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              rules={{ required: "First Name is required" }}
              item={item}
              errors={errors}
            />
            {/* LAST NAME */}
            <PassengerField
              label="last name"
              name={`lastName`}
              description="Last name of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              rules={{ required: "Last Name is required" }}
              item={item}
              errors={errors}
            />
            {/* EMAIL */}
            <PassengerField
              label="email"
              name={`email`}
              description="Email of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              rules={{ required: "Email is required", pattern: /^\S+@\S+$/i }}
              item={item}
              errors={errors}
            />
            {/* PHONE */}
            {/* <Controller
            name="phone"
            control={control}
            rules={{ required: "Phone is required", validate: (value:any) => isValidPhoneNumber(value) }}
            render={({ field: { onChange, value } }) => (
                <PhoneInput
                value={value}
                onChange={onChange}
                defaultCountry="US"
                id="phone-input"
                />
            )}
            /> */}
            {/* {errors?.cabins?.[cabinIndex]?.passengers?.[index].phone?.message && (
            <FormMessage>
                {errors?.cabins?.[cabinIndex]?.passengers?.[index].phone?.message}
            </FormMessage>
            )} */}
            <PassengerField
              label="phone"
              name={`phone`}
              description="Phone of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              rules={{
                required: "Phone is required",
                validate: (value: any) => {
                  return false;
                },
              }}
              item={item}
              errors={errors}
            >
              <div>
                <PhoneInput
                  {...register(`cabins.${cabinIndex}.passengers.${index}.phone`, {
                    required: { value: true, message: "Phone is required" },
                    maxLength: { value: 20, message: "Phone is too long" },
                    minLength: { value: 10, message: "Phone is too short" },
                    // validate: (value:any) => isValidPhoneNumber(value) || "Invalid phone number"
                  })}
                  value={form.getValues(
                    `cabins.${cabinIndex}.passengers.${index}.phone`
                  )}
                  onChange={(e) => {
                    form.setValue(
                      `cabins.${cabinIndex}.passengers.${index}.phone`,
                      e
                    );
                    console.log(e);
                  }}
                  defaultCountry="US"
                  id="phone"
                />
                
              </div>
            </PassengerField>
            {/* METHOD */}
            <PassengerField
              label="contact method"
              name={`method`}
              description="Preferred method of contact"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              rules={{ required: "Method is required" }}
              item={item}
              errors={errors}
            >
              <Select
                //defaultValue={(item as Passenger).paxType}
                onValueChange={(value) => {
                  console.log(value);
                  form.setValue(
                    `cabins.${cabinIndex}.passengers.${index}.method`,
                    value,
                    { shouldValidate: true }
                  );
                }}
                value={form.getValues(
                  `cabins.${cabinIndex}.passengers.${index}.method`
                )}
                {...register(
                  `cabins.${cabinIndex}.passengers.${index}.method`
                )}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </PassengerField>
            {/* SCHOOL */}
            <PassengerField
              label="school"
              name={`school`}
              description="College you are representing"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              //rules={{ required: "School is required" }}
              item={item}
              errors={errors}
            />
            {/* CITY */}
            <PassengerField
              label="city"
              name={`city`}
              description="City of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              //rules={{ required: "City is required" }}
              item={item}
              errors={errors}
            />
            {/* STATE */}
            <PassengerField
              label="state"
              name={`state`}
              description="State of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              //rules={{ required: "State is required" }}
              item={item}
              errors={errors}
            />
            {/* ZIP */}
            <PassengerField
              label="zip"
              name={`zip`}
              description="Zip of passenger"
              cabinIndex={cabinIndex}
              index={index}
              form={form}
              register={register}
              //rules={{ required: "Zip is required" }}
              item={item}
              errors={errors}

            />
            

            {/* </PassengerField> */}

            {/* <input
                        className={`${className}`}
                        
                        {...register(`cabins.${cabinIndex}.passengers.${index}.firstName` as const)}
                       

                        defaultValue={(item as Passenger).firstName} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.lastName` as const)}
                        defaultValue={(item as Passenger).lastName} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.email` as const)}
                        defaultValue={(item as Passenger).email} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.phone` as const)}
                        defaultValue={(item as Passenger).phone} // make sure to set up defaultValue
                    />
                    
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.city` as const)}
                        defaultValue={(item as Passenger).city} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.state` as const)}
                        defaultValue={(item as Passenger).state} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.zip` as const)}
                        defaultValue={(item as Passenger).zip} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.school` as const)}
                        defaultValue={(item as Passenger).school} // make sure to set up defaultValue
                    />
                    <input
                         className={`${className}`}
                        {...register(`cabins.${cabinIndex}.passengers.${index}.method` as const)}
                        defaultValue={(item as Passenger).method} // make sure to set up defaultValue
                    /> */}
            {/* <button type="button" onClick={() => remove(index)}>
                        Delete
                    </button> */}
          </div>
        );
      })}
    </div>
  );
}
