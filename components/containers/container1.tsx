"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image, { StaticImageData } from "next/image.js";
import { StaticImport } from "next/dist/shared/lib/get-img-props.js";
import Link from "next/link";

export const Container1Header = ({headerText}: {headerText:string}) => {
    return ( <h2 className="text-2xl text-right  text-primary py-6 mx-3 my-6 font-bold">
    {headerText}
  </h2>)
}
export interface containerProps {
    header?: string;
    subHeader?: string;
    dates?: string[];
    messages?: string[];
    images?: string[];
    height?: string;
    width?: string;
    logo?: any;
    shortLists?: string[];
    buttonAction?: any;
    buttonText?: string;
  }
  export const Container1 = ({
    header,
    subHeader,
    dates,
    messages,
    images = [],
    logo,
    height = "500px",
    width = "w-96",
    shortLists,
    buttonAction,
    buttonText,
  }: containerProps) => {
    return (
      <div className="">
        <Card
          className={`flex flex-col ${width} transition-all ease-in-out duration-1000  cursor-default h-auto group `}
        >
          
            <CardTitle className="flex flex-col md:flex-row md:justify-between items-center justify-center text-xl uppercase font-light   text-primary p-3 my-4 mx-6 border-b-2 border-slate-200 shadow-sm text-right transition-all ease-in-out duration-1000 group-hover:border-slate-300 ">
              {logo && (
                <Image
                  className="mb-8 md:mb-0 "
                  alt="logo"
                  width={100}
                  height={100}
                  src={logo}
                />
              )}
             {header && header}
            </CardTitle>
          
          {images?.length > 0 && (
            <div className=" py-6 w-fit mx-auto shadow-sm rounded-sm">
              <Image
                alt="header"
                width={500}
                height={500}
                src={images[0]}
                className="rounded-md border-2 border-primary group-hover:border-primary-foreground  transition-all ease-in-out duration-500"
              />
            </div>
          )}
          {subHeader && (
            <CardHeader className="text-lg  text-right text-primary p-3 mx-8 my-1">
              {subHeader}
            </CardHeader>
          )}
          <CardContent className="group-hover:text-white">
            {messages?.map((message, index) => {
              return (
                <div
                  className="p-2 my-2 text-left rounded-md shadow-md text-black group-hover:text-primary group-hover:bg-primary-foreground transition-all duration-300 ease-in-out hover:bg-primary hover:text-primary-foreground hover:cursor-pointer"
                  key={index}
                >
                  <p>{message}</p>
                </div>
              );
            })}
            {shortLists?.map((message, index) => {
              {
                //console.log(message);
                return (
                  message !== null && (
                    <div
                      className="p-2 my-2 font-light text-left rounded-sm shadow-sm text-muted-foreground border-orange-100 border-2 bg-accent transition-all duration-300 ease-in-out hover:bg-primary hover:text-primary-foreground hover:border-primary-foreground cursor-default"
                      key={index}
                    >
                      <p>{message}</p>
                    </div>
                  )
                );
              }
            })}
          </CardContent>
          <CardFooter>
            {buttonAction && buttonText && <Button 
            className="w-2/3 font-light shadow-sm mx-auto uppercase"
            onClick={buttonAction}>{buttonText}
            </Button>}
          </CardFooter>
        </Card>
      </div>
    );
  };