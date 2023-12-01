"use client";
import React, { useState } from "react";
import { z } from "zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { sendAdminPushNotification } from "@/lib/pushover";
import { monoton, orbitron, prompt } from "@/lib/fonts";

import Error from "next/error";

export default function Quicksignup() {
  const schema = z.object({
    firstName: z.string().min(2),
    lastName: z
      .string({
        required_error: "Last Name Required.",
        invalid_type_error: "Last Name Required.",
      })
      .min(2),
    email: z.string().optional(),
    phone: z.string().optional(),
    contactMethod: z.string(),
    comments: z.string().optional(),
  });
  type FormValues = z.infer<typeof schema>;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      contactMethod: "email",
      comments: "",
    },
  });
  const { register, handleSubmit, formState } = form;
  const { errors } = formState;
  const [contactMethod, setContactMethod] = useState("email");
  const [errorMessage, setErrorMessage] = useState("");
  const [registered, setRegistered] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const updateContactMethod = (e: any) => {
    form.setValue("contactMethod", e);
    setContactMethod(e);
    console.log(e);
  };
  const onSubmit = async (data: any) => {
    setErrorMessage("");
    setSuccessMessage("");

    if (data.contactMethod === "email") {
      data.phone = null;
    } else {
      data.email = null;
    }
    console.log("form submitted", data);
    try {
      // const res = await axios.post("/api/register", data);
      // console.log(res);
      sendAdminPushNotification(
        `New Leisure Life Contact Request: ${data.firstName} ${
          data.lastName
        } - ${data.contactMethod} - ${
          data.contactMethod === "email" ? data.email : data.phone
        } - ${data.comments}`
      );
      console.log("push sent");
      await axios.post("/api/contact", data);
      setSuccessMessage(
        `Thank you for your request ${data.firstName}, someone will be in touch soon!`
      );
      setRegistered(true);
    } catch (error: any) {
      console.log(error.request);
      if (error.request.status === 409) {
        console.log(error.message);
        setErrorMessage("Phone or Email already registered.");
        //window.alert(error);
      } else {
        setErrorMessage("Something went wrong, please try again later.");
        window.alert(error);
      }
    }
  };
  //   console.log(form.getValues());
  //   console.log(schema.safeParse(form.getValues()));
  return (
    <form
      {...form}
      // className={cn(
      //   "relative text-blue-600 body-font bg-gradient-to-br bg-violet-400? w-full from-violet-200/30 via-violet-400/30 to-black rounded-sm",
      //   prompt.className
      // )}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="py-5 m-1 mx-auto rounded-sm shadow-md md:w-[500px] md:px-5 bg-white/90 ">
        <div className="flex flex-col mb-6 text-center">
          {/* <h1 className="mb-4 text-2xl font-medium text-slate-900 sm:text-3xl title-font">
            Request Agent Contact
          </h1> */}
          {/* {!registered && (
            <p className="mx-auto text-base leading-relaxed lg:w-2/3">
              We will contact you to arrange your booking!
            </p>
          )} */}
          <p className="text-lg text-red-500">{errorMessage}</p>
          <p className="text-lg text-green-500">{successMessage}</p>
        </div>
        {!registered && (
          <div>
            <div className="flex flex-col items-center justify-center ">
              <label className="text-sm leading-7 text-gray-600">
                Contact Method
              </label>
              <RadioGroup
                defaultValue="email"
                className="flex items-center justify-around p-3 mx-auto mb-2 text-gray-200 font-extralight bg-[gray] border-spacing-2 border-[1px] rounded-sm w-72"
                onValueChange={updateContactMethod}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="email" />
                  <Label htmlFor="email">email</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="phone" id="phone" />
                  <Label htmlFor="phone">phone</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="text" id="text" />
                  <Label htmlFor="text">text</Label>
                </div>
              </RadioGroup>
            </div>
            <div
            //className="m-0 mx-auto lg:w-1/2 md:w-2/3"
            >
              <div className="flex flex-wrap -m-2">
                <div className="w-1/2 p-2">
                  <div className="relative">
                    <label className="text-sm leading-7 text-gray-600">
                      First Name
                    </label>
                    <input
                      required
                      title="firstName"
                      type="text"
                      id="firstName"
                      {...register("firstName", { required: true })}
                      className="w-full px-3 py-1 text-base leading-8 text-gray-700 transition-colors duration-200 ease-in-out bg-gray-100 bg-opacity-50 border border-gray-300 rounded outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                    />
                    <p className="text-sm text-red-500">
                      {errors?.firstName && errors.firstName?.message}
                    </p>
                  </div>
                </div>
                <div className="w-1/2 p-2">
                  <div className="relative">
                    <label className="text-sm leading-7 text-gray-600">
                      Last Name
                    </label>
                    <input
                      required
                      title="lastName"
                      type="text"
                      id="lastName"
                      {...register("lastName", { required: true })}
                      className="w-full px-3 py-1 text-base leading-8 text-gray-700 transition-colors duration-200 ease-in-out bg-gray-100 bg-opacity-50 border border-gray-300 rounded outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                    />
                    <p className="text-sm text-red-500">
                      {errors?.lastName && errors.lastName?.message}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col w-1/2 mx-auto">
                  {contactMethod == "email" && (
                    <div className="w-full ">
                      <div className="">
                        <label className="text-sm leading-7 text-gray-600">
                          Email
                        </label>
                        <input
                          required
                          title="email"
                          type="email"
                          pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}"
                          id="email"
                          {...register("email", { required: true })}
                          className="w-full px-3 py-1 text-base leading-8 text-gray-700 transition-colors duration-200 ease-in-out bg-gray-100 bg-opacity-50 border border-gray-300 rounded outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                    </div>
                  )}
                  {(contactMethod === "phone" || contactMethod === "text") && (
                    <div className="w-full ">
                      <div className="">
                        <label className="text-sm leading-7 text-gray-600">
                          {contactMethod === "phone" ? "Phone" : "Text"}
                        </label>
                        <input
                          required
                          title="phone"
                          type="phone"
                          pattern="[0-9]?[0-9]{3}-?[0-9]{3}-?[0-9]{4}"
                          id="phone"
                          {...register("phone", { required: true })}
                          className="w-full px-3 py-1 text-base leading-8 text-gray-700 transition-colors duration-200 ease-in-out bg-gray-100 bg-opacity-50 border border-gray-300 rounded outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                    </div>
                  )}
                   <div className="flex items-center justify-center mt-3">
                  <div className="mx-auto ">
                    <label className="text-sm leading-7 text-gray-600">
                      Which cruise are you interested in?
                    </label>
                    <textarea
                      title="comments"
                      id="comments"
                      cols={30}
                      rows={2}
                      {...register("comments")}
                    ></textarea>
                  </div>
                </div>
                </div>
               
                <div className="w-full p-2">
                  <button className="flex px-8 py-2 mx-auto mt-4 text-lg text-white bg-indigo-500 border-0 rounded focus:outline-none hover:bg-indigo-600">
                    Submit
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
