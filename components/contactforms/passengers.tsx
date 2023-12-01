
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  gender: string;
  dob: string;
  email: string;
  phone: string;
  school: string;
  city: string;
  state: string;
  zip: string;
  method: ContactMethod;
  loyalty:string;
}
const PassengerField = ({
  required,
  label,
  name,
  description,
  register,
  preRegistered = false,
  inputType,
  cabinIndex,
  index,
  rules,
  form,
  item,
  children,
  errors,
}: {
  required?: boolean;
  label: string | null;
  name: string;
  description: string;
  cabinIndex: number;
  index: number;
  rules?: object;
  form: any;
  inputType: string;
  item: any;
  register: any;
  preRegistered?: boolean;
  children?: React.ReactNode;
  errors: any;
}) => {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel 
          className="text-sm font-medium text-yellow-500"
          htmlFor={name}>{label}{required && <span className="text-xl text-red-700">*</span>}</FormLabel>}
          <FormControl>
            {children ? (
              children
            ) : (
              <Input
                 className={`text-black `}
                type={inputType || "text"}
                { ...register(
                  `cabins.${cabinIndex}.passengers.${index}.${name}`,
                  rules,
                  {shouldValidate: true}
                )}
                // value={form.getValues( `cabins.${cabinIndex}.passengers.${index}.${name}`)}
                //ref={null}
                // onChange={(e) => {
                //   console.log(
                //     `cabins.${cabinIndex}.passengers.${index}.${name}`,
                //     e.target.value
                //   );
                 
                //   form.setValue(
                //     `cabins.${cabinIndex}.passengers.${index}.${name}`,
                //     e.target.value
                //     ,
                //     { shouldValidate: true }
                //   );
                // }}
              />
            )}
          </FormControl>
           {errors?.cabins?.[cabinIndex]?.passengers?.[index]?.[name] ? <FormMessage>
            {errors?.cabins?.[cabinIndex]?.passengers?.[index]?.[name]?.message}
          </FormMessage> :
          <FormDescription className="text-xs text-white">{description.toLowerCase()}</FormDescription>}
         
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
  const [names, setNames] = React.useState<string[]>([]);
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
      gender: "",
      dob: new Date('1980-01-01').toISOString().substring(0, 10),
      
      email: "",
      phone: "",
      school: "",

      city: "",
      state: "",
      zip: "",
      method: 'email',
      loyalty: ""
    },{shouldFocus: true});
  };
  const removePassenger = () => {
    remove(fields.length - 1);
  };
  return (
    <Tabs defaultValue="passenger1"
    className=""
    >
      <TabsList className="grid items-start justify-start w-full grid-flow-col bg-transparent">
        {fields.map((item, index) => {
          return (
            <TabsTrigger
              key={item.id}
              value={`passenger${index + 1}`}
              className="h-5 text-yellow-500"
              onClick={() => setNames([''])}
            >
              {form.getValues(`cabins.${cabinIndex}.passengers.${index}.firstName`) || `Passenger ${index + 1}`}
              {/* {(item as Passenger).firstName || `Passenger ${index + 1}`}  */}
            </TabsTrigger>
          );
        })}
      </TabsList>
      
      <div>
        {fields.map((item, index) => {
          return (
            <TabsContent 
            value={`passenger${index + 1}`} 
            key={item.id}
            className="overflow-y-auto md:h-64?"
            //className="flex flex-col h-64 overflow-y-auto" key={item.id}
            >
              {/* PASSENGER TYPE */}
              <PassengerField
                label={null}
                name={`paxType`}
                description="Adult or child?"
                cabinIndex={cabinIndex}
                index={index}
                form={form}
                register={register}
                rules={{ required: "Pax Type is required" }}
                item={item}
                errors={errors}
                inputType="text"
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
                  <SelectTrigger 
                  className="text-black"
                  >
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
                required={true}
                inputType="text"
              />
              <PassengerField
                label="middle name"
                name={`middleName`}
                description="Middle name of passenger"
                cabinIndex={cabinIndex}
                index={index}
                form={form}
                register={register}
                //rules={{ required: "Last Name is required" }}
                item={item}
                errors={errors}
                required={false}
                inputType="text"
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
                required={true}
                inputType="text"
              />
              
              <PassengerField
                label="gender"
                name={`gender`}
                description="gender of passenger"
                cabinIndex={cabinIndex}
                index={index}
                form={form}
                register={register}
                rules={{ required: "gender is required" }}
                item={item}
                errors={errors}
                required={true}
                inputType="text"
              >
                <Select
                  //defaultValue={(item as Passenger).paxType}
                  onValueChange={(value) => {
                    console.log(value);
                    form.setValue(
                      `cabins.${cabinIndex}.passengers.${index}.gender`,
                      value,
                      { shouldValidate: true }
                    );
                  }}
                  value={form.getValues(
                    `cabins.${cabinIndex}.passengers.${index}.gender`
                  )}
                  {...register(
                    `cabins.${cabinIndex}.passengers.${index}.gender`
                  )}
                >
                  <SelectTrigger 
                  className="text-black"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup >
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectGroup>
                    
                  </SelectContent>
                </Select>
              </PassengerField>

              {/* DOB */}
              <PassengerField
                label="date of birth"
                name={`dob`}
                description="Date of birth"
                cabinIndex={cabinIndex}
                index={index}
                form={form}
                register={register}
                rules={{ required: true}}
                item={item}
                errors={errors}
                required={true}
                inputType="date"
              >
                <Input
                 type="date"
                className="text-black"
                required
                // defaultValue={new Date('1980-01-01').toISOString().substring(0, 10)}

                defaultValue={form.getValues(`cabins.${cabinIndex}.passengers.${index}.dob`)}
                 
                  // {...register(
                  //   `cabins.${cabinIndex}.passengers.${index}.dob`,
                  //   {
                  //     //valueAsDate: true,
                  //     required: "Date of birth is required",
                  //     // validate: (value: any) => {
                  //     //   return false;
                  //     // },
                  //   }
                  // )}
                  // value={form.getValues(
                  //   `cabins.${cabinIndex}.passengers.${index}.dob`
                  // )}
                  onChange={(e) => {
                    console.log(
                      `cabins.${cabinIndex}.passengers.${index}.dob`,
                      e.target.value
                    );
                    form.setValue(
                      `cabins.${cabinIndex}.passengers.${index}.dob`,
                      e.target.value,
                      { shouldValidate: true }
                    );
                  }}
                />
              </PassengerField>

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
                required={true}
                inputType="text"
              />
              
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
                required={true}
                preRegistered={true}  
                inputType="text"
              >
                <div>
                  <PhoneInput
                  className="text-black"
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
                inputType="text"
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
                  <SelectTrigger 
                  className="text-black"
                  >
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
              {/* <p className="py-5 font-bold text-white">OPTIONAL</p> */}
              {/* SCHOOL */}
              {/* <PassengerField
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
                inputType="text"
              /> */}
              {/* CITY */}
              <PassengerField
              required
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
                inputType="text"
              />
              {/* STATE */}
              <PassengerField
              required
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
                inputType="text"
              />
              {/* ZIP */}
              <PassengerField
              required
                label="zip"
                name={`zipCode`}
                description="Zip Code of passenger"
                cabinIndex={cabinIndex}
                index={index}
                form={form}
                register={register}
                //rules={{ required: "Zip is required" }}
                item={item}
                errors={errors}
                inputType="text"
              />


              {/* loyalty */}
              <PassengerField
                label="MSC loyalty #"
                name={`zip`}
                description="cruise line loyalty #"
                cabinIndex={cabinIndex}
                index={index}
                form={form}
                register={register}
                //rules={{ required: "Zip is required" }}
                item={item}
                errors={errors}
                inputType="text"
              />
        
              
            </TabsContent>
          );
        })}
      </div>
    </Tabs>
  );
}
