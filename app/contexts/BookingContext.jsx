"use client";

import { useReducer, useState, createContext, useEffect } from "react";
import { useRouter } from 'next/navigation'
import searchParams from "@/components/vtg/searchParams.json";
import { Passenger } from "../utils/BookingInfo2";
import { SignIn, useAuth, useUser } from "@clerk/nextjs";
import { resolve } from "path";
import { set } from "zod";



export const BookingContext = createContext();

export const BookingProvider = ({ children }) => {
  const passengerReducer = (state, action) => {
    //state = passengers[passengerIndex]
    console.log('action called for passenger = ',action);
    //console.log('passenger state = ',passengers[passengerIndex]);
    
    const { value, type, passengerIndex } = action;
    console.log("passenger index = ", passengerIndex);
    let newPassengers = [...passengers];
    let newState = {};
    
    //console.log(`value: ${value}, type: ${type}, state: ${state}`);
    switch (type) {
      case "SET_PAX":
        newState = { ...newPassengers[passengerIndex], paxType: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        break;
      case "SET_TITLE":
        
        newState = { ...newPassengers[passengerIndex], title: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        
        break;
      case "SET_FIRST_NAME":
        newState = { ...newPassengers[passengerIndex], firstName: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        return newPassengers
        break;
      case "SET_MIDDLE_NAME":
        newState = { ...newPassengers[passengerIndex], middleName: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)  
        //return newPassengers
        break;
      case "SET_LAST_NAME":
        newState = { ...newPassengers[passengerIndex], lastName: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)  
        //return newPassengers
        break;
      case "SET_AGE":
        newState = { ...newPassengers[passengerIndex], age: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
       
        break;
      case "SET_EMAIL":
        newState = { ...newPassengers[passengerIndex], email: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   email: value,
        // };
        break;
      case "SET_PHONE_1":
        newState = { ...newPassengers[passengerIndex], phone1: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   phone1: value,
        // };
        break;
      case "SET_PHONE_2":
        newState = { ...newPassengers[passengerIndex], phone2: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   phone2: value,
        // };
        break;
      case "SET_VIP_NUMBER":
        newState = { ...newPassengers[passengerIndex], vipNumber: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   vipNumber: value,
        // };
        break;
      case "SET_FARE_CODE":
        newState = { ...newPassengers[passengerIndex], fareCode: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   fareCode: value,
        // };
        break;
      case "SET_DOC_INFO_TYPE":
        const newDocInfo = { ...newPassengers[passengerIndex].docInfo, type: value };
        newState = { ...newPassengers[passengerIndex], docInfo: newDocInfo };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   docInfo: newDocInfo,
        // };
        break;
      case "SET_ISSUE_DATE":
        const newDate1 = { ...newPassengers[passengerIndex].docInfo, issueDate: value };
        newState = { ...newPassengers[passengerIndex], docInfo: newDate1 };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   docInfo: newDate1,
        // };
        break;
      case "SET_EXPIRY_DATE":
        const newDate2 = { ...newPassengers[passengerIndex].docInfo, expiryDate: value };
        newState = { ...newPassengers[passengerIndex], docInfo: newDate2 };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   docInfo: newDate2,
        // };
        break;
      case "SET_DOC_INFO_COUNTRY":
        const newVal = { ...newPassengers[passengerIndex].docInfo, issueCountry: value };
        newState = { ...newPassengers[passengerIndex], docInfo: newVal };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   docInfo: newVal,
        // };
        break;
      case "SET_ADDRESS_1":
        const address_1 = { ...newPassengers[passengerIndex].address, address1: value };
        newState = { ...newPassengers[passengerIndex], address: address_1 };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   address: address_1,
        // };
        break;
      case "SET_ADDRESS_2":
        const address_2 = { ...newPassengers[passengerIndex].address, address2: value };
        newState = { ...newPassengers[passengerIndex], address: address_2 };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   address: address_2,
        // };
        break;
      case "SET_ADDRESS_COUNTRY":
        const address_cntry = { ...newPassengers[passengerIndex].address, country: value };
        newState = { ...newPassengers[passengerIndex], address: address_cntry };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   address: address_cntry,
        // };
        break;
      case "SET_ADDRESS_STATE":
        const address_state = { ...newPassengers[passengerIndex].address, state: value };
        newState = { ...newPassengers[passengerIndex], address: address_state };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   address: address_state,
        // };
        break;
      case "SET_ADDRESS_CITY":
        const address_city = { ...newPassengers[passengerIndex].address, city: value };
        newState = { ...newPassengers[passengerIndex], address: address_city };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   address: address_city,
        // };
        break;
      case "SET_ADDRESS_ZIP":
        const address_zip = { ...newPassengers[passengerIndex].address, zip: value };
        newState = { ...newPassengers[passengerIndex], address: address_zip };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   address: address_zip,
        // };
        break;
      case "SET_CABIN_TYPE":
        newState = { ...newPassengers[passengerIndex], cabinType: value };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   cabinType: value,
        // };
        break;
      case "SET_AMENITY":
        const amenityArr = [...newPassengers[passengerIndex].amenities];
        if (amenityArr.includes(value)) {
          amenityArr.splice(amenityArr.indexOf(value), 1);
        } else {
          amenityArr.push(value);
        }
        newState = { ...newPassengers[passengerIndex], amenities: amenityArr };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   amenities: amenityArr,
        // };
        break;
      case "REMOVE_AMENITY":
        const amenityArr2 = [...state.amenities, value];
        amenityArr2.splice(amenityArr2.indexOf(value), 1);
        newState = { ...newPassengers[passengerIndex], amenities: amenityArr2 };
        console.log('newState = ',newState)
        
        newPassengers.splice(passengerIndex,1,newState)
        
        console.log('newPassengers = ',newPassengers)
        setPassengers(newPassengers)
        // return {
        //   ...state,
        //   amenities: amenityArr2,
        // };
        break;
      default:
        return state;
    }
  };
  let pass = new Passenger();
  const { isLoaded, isSignedIn, user } = useUser();
  
  
  const [passengerIndex, setPassengerIndex] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [currentTrip, setCurrentTrip] = useState(null);
  const [passengers, setPassengers] = useState([pass]);
  const [curPassenger, setCurPassenger] = useReducer(passengerReducer, passengers);
  const [showingResults, setShowingResults] = useState(false);
  const [search, setSearch] = useState({
    allVals: {
      incCT: "y",
      sm: "0",
      sd: "0",
      tm: "0",
      td: "0",
      r: "0",
      l: 0,
      n: "0",
      d: "0",
      rd: "0",
      v: "0",
      rt: "0",
      s: 0,
    },
    ships: searchParams["sortedShips"],
  });
  const [header, setHeader] = useState("Search Cruises");
  const [buttonVisible, setButtonVisible] = useState(false);
  

  
  if(!isLoaded){return null}else{
    if(user){
      // pass.email = user.emailAddresses[0].emailAddress;
      // pass.firstName = user.firstName;
      // pass.lastName = user.lastName;
    }
    
      
  }
  
  console.log('isLoaded = ',isLoaded)
  
  const params = searchParams;
  //console.log(curPassenger);

  return (
    <BookingContext.Provider
      value={{
        passengers,
        setPassengers,
        curPassenger,
        setCurPassenger,
        passengerIndex,
        setPassengerIndex,
        searchResults,
        setSearchResults,
        currentTrip,
        setCurrentTrip,
        search,
        setSearch,
        header,
        setHeader,
        buttonVisible,
        setButtonVisible,
        showingResults,
        setShowingResults,
        params,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
//  }else{
//  return <SignIn />
//  }
  
};
