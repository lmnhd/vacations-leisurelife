import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export const IS_SERVER = typeof window === "undefined";
export function getProtocol() {
  const isProd = process.env.VERCEL_ENV === "production";
  if (isProd) return "https://";
  return "http://";
}
export function absoluteUrl(subLink?:string) {
  //get absolute url in client/browser
  if (!IS_SERVER) {
    return location.origin;
  }
  //get absolute url in server.
  const protocol = getProtocol();
  if (process.env.VERCEL_URL) {
    return `${protocol}${process.env.VERCEL_URL}${subLink ? subLink : ""}`;
  }else{
    return `${protocol}${process.env.NEXT_PUBLIC_APP_URL}${subLink ? subLink : ""}`;
  }
}


export const cabinTypes = [
  { name: "Interior Bella $167.00 pp", value: "interior_bella" },
  { name: "Deluxe Interior $187.00 pp", value: "deluxe_interior" },
  { name: "Ocean View Bella $227.00 pp", value: "ocean_view_bella" },
  { name: "Deluxe Ocean View $247.00 pp", value: "deluxe_ocean_view" },
  { name: "Balcony Bella $287.00 pp", value: "balcony_bella" },
  { name: "Deluxe Balcony $327.00 pp", value: "deluxe_balcony" },
  
]

export enum CabinPrices {
  interior_bella = 16700,
  deluxe_interior = 18700,
  ocean_view_bella = 22700,
  deluxe_ocean_view = 24700,
  balcony_bella = 28700,
  deluxe_balcony = 32700,
}
export const depositAmount = 19800;

export const formatPrice = (price: number) => {
  return (price/100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
export const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
export const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "numeric",
  });
}
export const calculateAge = (dob: string) => {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if(m < 0 || (m === 0 && today.getDate() < birthDate.getDate())){
    age--;
  }
  return age;
}
export const getPhoneNumber = () => {
  return process.env.NEXT_PUBLIC_LLV_PHONE
}

