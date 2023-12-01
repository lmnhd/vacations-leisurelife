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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import Stepper from "./input/stepper";
import Passengers, { Passenger, ContactMethod, PaxType } from "./passengers";
import { CabinPrices, depositAmount } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import {
  Control,
  FieldArrayWithId,
  FieldErrors,
  UseFormRegister,
  UseFormReturn,
} from "react-hook-form";
import { PreRegisterForm2Values } from "./preRegisterForm2";
import { cn } from "@/lib/utils";
import { prompt } from "@/lib/fonts";
import CreditCardIMG from "@/public/credit cards.jpeg";
import Cards from "react-credit-cards-2";
import "react-credit-cards-2/dist/es/styles-compiled.css";
import {
  formatCreditCardNumber,
  formatCVC,
  formatExpirationDate,
} from "@/lib/paymentUtils";

interface Cabin {
  id: string;
  // Add any other properties here
}
const CabinField = ({
  required,
  label,
  name,
  description,
  handleChange,
  preRegistered = false,
  inputType,
  cabinIndex,
  index,
  rules,
  form,
  item,
  children,
  errors,
  pattern = '',
  register,
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
  item?: any;
  handleChange: any;
  preRegistered?: boolean;
  children?: React.ReactNode;
  errors: any;
  pattern?: string;
  register?: any;
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
                //pattern={pattern}
                name={name}
                // { ...register(
                //   `cabins.${cabinIndex}.${name}`,
                //   rules,
                //   {shouldValidate: true}
                // )}
                 value={form.getValues( `cabins.${cabinIndex}.${name}`)}
                //ref={null}
                onChangeCapture={(e) => {
                  // console.log(
                  //   `cabins.${cabinIndex}.${name}`,
                  //   e.target.value
                  // );
                 
                 handleChange(e, name);
                }}
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
export default function Cabins({
  cabinFields,
  form,
  register,
  errors,
  control,
  cabinTypes,
  authorizeNow,
  setAuthorizeNow,
  
}: {
  cabinFields: any;
  form: any;
  register: any;
  errors: any;
  control: any;
  cabinTypes: any;
  authorizeNow: boolean;
  setAuthorizeNow: any;
  
}) {
  const [cabinPrice, setCabinPrice] = React.useState(
    CabinPrices.interior_bella
  );
  
  const { getValues } = form;
  const handleCCInputChange = (evt: any) => {
  console.log(evt.target.name)
  const name = evt.target.name;
  const value = evt.target.value;
    // const { name, value } = evt.target;
    
     console.log("handleCCInputChange",`${name} - ${value}` );
    // console.log(formatCreditCardNumber(value));
    let cardFunc = formatCreditCardNumber;
    if (name === "ccExp") {
      cardFunc = formatExpirationDate;
    }
    if (name === "ccCvv") {
      cardFunc = formatCVC;
    }
    if (name === "ccName") {
      cardFunc = (value: string) => value.toUpperCase();
    }
   
    form.setValue(`cabins.${0}.${name}`, cardFunc(value), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  
  };

  const handleCCInputFocus = (evt: any) => {
    //setState((prev) => ({ ...prev, focus: evt.target.name }));
  };
  const cabinPriceChange = (cabinIndex: number, value: string) => {
    console.log("cabinPriceChange", cabinIndex, value);
    form.setValue(`cabins.${cabinIndex}.cabinType`, value, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    form.setValue(
      `cabins.${cabinIndex}.cabinPrice`,
      CabinPrices[value as keyof typeof CabinPrices]
    );
    setPayNowPrice(cabinIndex, form.getValues(`cabins.${cabinIndex}.payNow`));

    console.log(formatPrice(CabinPrices[value as keyof typeof CabinPrices]));
    setCabinPrice(CabinPrices[value as keyof typeof CabinPrices]);
  };
  const payNowChange = (cabinIndex: number, value: string) => {
    console.log("payNowChange", cabinIndex, value);
    form.setValue(`cabins.${cabinIndex}.payNow`, value, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setPayNowPrice(cabinIndex, value);

    console.log(formatPrice(CabinPrices[value as keyof typeof CabinPrices]));
  };
  function setPayNowPrice(cabinIndex: number, value: string) {
    switch (value) {
      case "deposit_only":
        form.setValue(`cabins.${cabinIndex}.payNowPrice`, depositAmount);
        break;
      case "full_payment":
        form.setValue(
          `cabins.${cabinIndex}.payNowPrice`,
          (CabinPrices[
            form.getValues(
              `cabins.${cabinIndex}.cabinType`
            ) as keyof typeof CabinPrices
          ] +
            7500) *
            2
        );
        break;
      default:
        form.setValue(`cabins.${cabinIndex}.payNowPrice`, depositAmount);
        break;
    }
  }

  return (
    <Tabs defaultValue="cabin1">
      {/* <TabsList className="grid items-start justify-start w-full grid-flow-col bg-transparent">
        {cabinFields.map((cabin: any, cabinIndex: number) => {
          return (
            <TabsTrigger
              key={`cabin${cabinIndex + 1}`}
              value={`cabin${cabinIndex + 1}`}
            >
              Cabin {cabinIndex + 1}
            </TabsTrigger>
          );
        })}
      </TabsList> */}
      <div
        className={cn(
          "flex flex-wrap items-center border-t-2 mb-10 border-gray-500/20 py-5 justify-center gap-4",
          prompt.className
        )}
      >
        {cabinFields.map((cabin: Cabin, cabinIndex: number) => {
          return (
            <TabsContent
              key={`cabin${cabinIndex + 1}`}
              value={`cabin${cabinIndex + 1}`}
            >
              <div key={cabin.id} className="md:h-96? ">
                <div className="flex flex-row flex-wrap items-stretch justify-around gap-10 overflow-auto cabin-wrapper">
                  <div className="h-full cabin-console-wrapper">
                    <FormField
                      name={`cabins.${cabinIndex}.cabinType`}
                      control={control}
                      key={`cabins.${cabinIndex}.cabinType`}
                      defaultValue="interior"
                      render={({ field, fieldState, formState }) => (
                        <FormItem>
                          <FormLabel
                            className="text-yellow-500"
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
                                cabinPriceChange(cabinIndex, value);
                              }}
                              {...register(`cabins.${cabinIndex}.cabinType`)}
                            >
                              <SelectTrigger className="text-black">
                                <SelectValue placeholder="Cabin Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {cabinTypes.map(
                                    (cabinType: any, index: number) => {
                                      return (
                                        <SelectItem
                                          key={cabinType.value}
                                          value={cabinType.value}
                                        >
                                          {cabinType.name}
                                        </SelectItem>
                                      );
                                    }
                                  )}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormDescription className="text-xs text-white">
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
                        <FormItem className="text-center text-yellow-500">
                          <FormLabel htmlFor="numPassengers">
                            Number of Passengers
                          </FormLabel>
                          <FormControl>
                            <Stepper
                              CurrentValue={getValues(
                                `cabins.${cabinIndex}.numPassengers`
                              )}
                              MaxValue={2}
                              MinValue={1}
                              onChange={(value) => {
                                form.setValue(
                                  `cabins.${cabinIndex}.numPassengers`,
                                  value,
                                  { shouldValidate: true }
                                );
                              }}
                            />
                          </FormControl>
                          <FormDescription className="text-xs text-white">
                            The number of passengers in this cabin.
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    {/* Payment Amount */}
                    <RadioGroup
                      defaultValue="contact"
                      onValueChange={(e) => {
                        if (e === "authorize") {
                          setAuthorizeNow(true);
                        } else {
                          setAuthorizeNow(false);
                        }
                      }}
                      className="p-2 my-4 text-black bg-white rounded-sm w-72"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="contact" id="r1" />
                        <Label htmlFor="r1">Contact me for payment</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="authorize" id="r2" />
                        <Label htmlFor="r2">
                          I will authorize my payment now
                        </Label>
                      </div>
                    </RadioGroup>
                    {authorizeNow && (
                      <FormField
                        name={`cabins.${cabinIndex}.payNow`}
                        control={control}
                        key={`cabins.${cabinIndex}.payNow`}
                        defaultValue="deposit_only"
                        render={({ field, fieldState, formState }) => (
                          <FormItem>
                            <FormLabel
                              className="text-yellow-500"
                              //htmlFor={`cabins.${cabinIndex}.cabinType`}
                            >
                              I want to pay...
                            </FormLabel>
                            <FormControl>
                              <Select
                                {...field}
                                {...fieldState}
                                {...formState}
                                value={form.getValues(
                                  `cabins.${cabinIndex}.payNow`
                                )}
                                onValueChange={(value) => {
                                  payNowChange(cabinIndex, value);
                                }}
                                {...register(`cabins.${cabinIndex}.payNow`)}
                              >
                                <SelectTrigger className="text-black">
                                  <SelectValue placeholder="Deposit Only" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectItem value="deposit_only">
                                      Deposit Only: {formatPrice(depositAmount)}
                                    </SelectItem>
                                    <SelectItem value="full_payment">
                                      Full Payment:{" "}
                                      {formatPrice(cabinPrice * 2)}
                                    </SelectItem>
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormDescription className="text-xs text-white">
                              The amount you authorize us to charge your card
                            </FormDescription>
                            <FormMessage>
                              {errors.cabins?.[cabinIndex]?.cabinType?.message}
                            </FormMessage>
                          </FormItem>
                        )}
                      />
                    )}
                    {authorizeNow && (
                      <div className="flex flex-col">
                        <Cards
                          number={form.getValues(
                            `cabins.${cabinIndex}.ccNumber`
                          )}
                          cvc={form.getValues(`cabins.${cabinIndex}.ccCvv`)}
                          expiry={form.getValues(`cabins.${cabinIndex}.ccExp`)}
                          name={form.getValues(`cabins.${cabinIndex}.ccName`)}
                          focused={form.getValues(
                            `cabins.${cabinIndex}.ccFocus`
                          )}
                        />
                        
                        <CabinField
                          name="ccNumber"
                          label="Credit Card Number"
                          description="The number on the front of your card"
                          cabinIndex={cabinIndex}
                          index={0}
                          inputType="text"
                          form={form}
                          errors={errors} 
                          handleChange={handleCCInputChange}
                          preRegistered={true}
                          //pattern="[0-9]*"
                          register={register}
                          

                          />
                        <CabinField 
                          name="ccName"
                          label="Name on Card"
                          description="The name on the card"
                          cabinIndex={cabinIndex}
                          index={0}
                          inputType="text"
                          form={form}
                          errors={errors} 
                          handleChange={handleCCInputChange}
                          preRegistered={true}
                          register={register}
                          />

                        <CabinField
                          name="ccExp"
                          label="Expiration Date"
                          description="The expiration date of card"
                          cabinIndex={cabinIndex}
                          index={0}
                          inputType="text"
                          form={form}
                          errors={errors} 
                          handleChange={handleCCInputChange}
                          preRegistered={true}
                          pattern="\d\d/\d\d"
                          register={register}

                          />
                        <CabinField
                          name="ccCvv"
                          label="CVV"
                          description="The 3/4 digit code on the back of card"
                          cabinIndex={cabinIndex}
                          index={0}
                          inputType="text"
                          form={form}
                          errors={errors} 
                          handleChange={handleCCInputChange}
                          preRegistered={true}
                          pattern="[0-9]*"
                          register={register}

                          />
                        
                      </div>
                    )}
                  </div>
                  <Passengers
                    cabinIndex={cabinIndex}
                    control={control}
                    register={register}
                    numPassengers={getValues(
                      `cabins.${cabinIndex}.numPassengers`
                    )}
                    form={form}
                    errors={errors}
                  />
                </div>
              </div>
            </TabsContent>
          );
        })}
      </div>
    </Tabs>
  );
}
