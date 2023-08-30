"use client";

import { useReducer, useState, createContext } from "react";
import searchParams from "../(dashboard)/(routes)/search/searchParams.json";
import { Passenger } from "../utils/BookingInfo2";

const passengerReducer = (state, action) => {
  //console.log(action);
  const { value, type } = action;
  //console.log(`value: ${value}, type: ${type}, state: ${state}`);
  switch (type) {
    case "SET_PAX":
      return {
        ...state,
        paxType: value,
      };
      break;
    case "SET_TITLE":
      return {
        ...state,
        title: value,
      };
      break;
    case "SET_FIRST_NAME":
      return {
        ...state,
        firstName: value,
      };
      break;
    case "SET_MIDDLE_NAME":
      return {
        ...state,
        middleName: value,
      };
      break;
    case "SET_LAST_NAME":
      return {
        ...state,
        lastName: value,
      };
      break;
    case "SET_AGE":
      return {
        ...state,
        age: value,
      };
      break;
    case "SET_EMAIL":
      return {
        ...state,
        email: value,
      };
      break;
    case "SET_PHONE_1":
      return {
        ...state,
        phone1: value,
      };
      break;
    case "SET_PHONE_2":
      return {
        ...state,
        phone2: value,
      };
      break;
    case "SET_VIP_NUMBER":
      return {
        ...state,
        vipNumber: value,
      };
      break;
    case "SET_FARE_CODE":
      return {
        ...state,
        fareCode: value,
      };
      break;
    case "SET_DOC_INFO_TYPE":
      const newDocInfo = { ...state.docInfo, type: value };
      return {
        ...state,
        docInfo: newDocInfo,
      };
      break;
    case "SET_ISSUE_DATE":
      const newDate1 = { ...state.docInfo, issueDate: value };
      return {
        ...state,
        docInfo: newDate1,
      };
      break;
    case "SET_EXPIRY_DATE":
      const newDate2 = { ...state.docInfo, expiryDate: value };
      return {
        ...state,
        docInfo: newDate2,
      };
      break;
    case "SET_DOC_INFO_COUNTRY":
      const newVal = { ...state.docInfo, issueCountry: value };
      return {
        ...state,
        docInfo: newVal,
      };
      break;
    case "SET_ADDRESS_1":
      const address_1 = { ...state.address, address1: value };
      return {
        ...state,
        address: address_1,
      };
      break;
    case "SET_ADDRESS_2":
      const address_2 = { ...state.address, address2: value };
      return {
        ...state,
        address: address_2,
      };
      break;
    case "SET_ADDRESS_COUNTRY":
      const address_cntry = { ...state.address, country: value };
      return {
        ...state,
        address: address_cntry,
      };
      break;
    case "SET_ADDRESS_STATE":
      const address_state = { ...state.address, state: value };
      return {
        ...state,
        address: address_state,
      };
      break;
    case "SET_ADDRESS_CITY":
      const address_city = { ...state.address, city: value };
      return {
        ...state,
        address: address_city,
      };
      break;
    case "SET_ADDRESS_ZIP":
      const address_zip = { ...state.address, zip: value };
      return {
        ...state,
        address: address_zip,
      };
      break;
    case "SET_CABIN_TYPE":
      return {
        ...state,
        cabinType: value,
      };
      break;
    case "SET_AMENITY":
      const amenityArr = [...state.amenities];
      if (amenityArr.includes(value)) {
        amenityArr.splice(amenityArr.indexOf(value), 1);
      } else {
        amenityArr.push(value);
      }
      return {
        ...state,
        amenities: amenityArr,
      };
      break;
    case "REMOVE_AMENITY":
      const amenityArr2 = [...state.amenities, value];
      amenityArr2.splice(amenityArr2.indexOf(value), 1);
      return {
        ...state,
        amenities: amenityArr2,
      };
      break;
    default:
      return state;
  }
};

export const BookingContext = createContext();

export const BookingProvider = ({ children }) => {
  const pass = new Passenger();
  const [passengers, setPassengers] = useState([pass]);
  const [searchResults, setSearchResults] = useState([]);
  const [currentTrip, setCurrentTrip] = useState(null);
  const [curPassenger, setCurPassenger] = useReducer(passengerReducer, pass);
  const [showingResults, setShowingResults] = useState(false);
  const params = searchParams;
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

  //console.log(curPassenger);
  return (
    <BookingContext.Provider
      value={{
        passengers,
        setPassengers,
        curPassenger,
        setCurPassenger,
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
};
