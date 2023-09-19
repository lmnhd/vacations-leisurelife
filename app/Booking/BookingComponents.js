import { Children, useContext, useState } from "react";
import { BookingContext } from "./BookingContext";
import { Passenger as passengerOBJ } from "./BookingInfo2";
import { Select } from "semantic-ui-react";
import {
  Input,
  Accordion,
  AccordionHeader,
  AccordionBody,
  Checkbox,
} from "@material-tailwind/react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { addKey, getNewsKey } from "../../Firebase";
//import MuiPhoneNumber from "material-ui-phone-number";

const BookingFormField = ({ label, children, required = false,width = `w-80` }) => {
  return (
    <div className={`booking-form-field grid grid-flow-row justify-items-center ${width}`}>
      <label className="bg-gray-100 w-full font-semibold rounded-md">
        <span>{label}{required && <i className="text-red-800 font-body"> * </i>}</span>
      </label>
      {children}
    </div>
  );
};
export const Passenger = ({ curPassenger, index }) => {
  const { setCurPassenger, currentTrip } = useContext(BookingContext);
  const [open, setOpen] = useState(1);
  const handleOpen = (value) => setOpen(open === value ? 0 : value);

  const update = (value, type) => {
    setCurPassenger({ value, type: type });
  };
  console.log(curPassenger);
  let cabins = curPassenger.cabinTypeFields
  
  if(currentTrip ){
    const cabinsList = currentTrip.mainInfo.prices.map((cabin) => {
      return {
        key: `${String(cabin[1].label).replace("Our","")} (${cabin[1].amount} )`,
        value: `${String(cabin[1].label).replace("Our","")} (${cabin[1].amount})`,
        text: `${String(cabin[1].label).replace("Our","")} (${cabin[1].amount} per-person)`,
      };

    })
    cabins = cabinsList
  }
  return (
    <div className="passenger mb-10">
      <h1>Passenger #{index ? index + 1 : 1}</h1>

      <Accordion open={open === 1} className="">
        <AccordionHeader onClick={() => handleOpen(1)}>
          General Information
        </AccordionHeader>
        <AccordionBody>
          <div className="main-info flex flex-row flex-wrap justify-evenly border-t-4 border-b-4">
            <BookingFormField label="Pax Type">
              <Select
                className={`booking-select`}
                //placeholder={label}
                options={curPassenger.paxTypeFields}
                onChange={(e, d) => update(d.value, "SET_PAX")}
                value={curPassenger.paxType}
              />
            </BookingFormField>
            <BookingFormField label="Title">
              <Select
                className={`booking-select`}
                placeholder={`Select Title`}
                options={curPassenger.titleFields}
                onChange={(e, d) => update(d.value, "SET_TITLE")}
                value={curPassenger.title}
              />
            </BookingFormField>
            <BookingFormField label="First Name" required={true}>
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`First Name`}
                //label={subField}
                name={`firstName`}
                onChange={(e, d) => update(e.target.value, "SET_FIRST_NAME")}
                value={curPassenger.firstName}
              />
            </BookingFormField>
            <BookingFormField label="Middle Name">
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`Middle Name`}
                //label={subField}
                name={`middleName`}
                onChange={(e, d) => update(e.target.value, "SET_MIDDLE_NAME")}
                value={curPassenger.middleName}
              />
            </BookingFormField>
            <BookingFormField label="Last Name"  required={true}>
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`Last Name`}
                //label={subField}
                name={`lastName`}
                onChange={(e, d) => update(e.target.value, "SET_LAST_NAME")}
                value={curPassenger.middleName}
              />
            </BookingFormField>
            <BookingFormField label="Age"  required={true}>
              <Input
                className={`booking-input`}
                type="number"
                placeholder={`Please Enter Age`}
                //label={subField}
                name={`age`}
                onChange={(e, d) => update(e.target.value, "SET_AGE")}
                value={curPassenger.middleName}
              />
            </BookingFormField>
            <BookingFormField label="Email"  required={true}>
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`Email Address`}
                //label={subField}
                name={`email`}
                onChange={(e, d) => update(e.target.value, "SET_EMAIL")}
                value={curPassenger.email}
              />
            </BookingFormField>
            <BookingFormField label="Phone 1"  required={true}>
              <PhoneInput
                className={`booking-phone h-10 w-full p-0 border-1 border-black rounded-sm shadow-sm`}
                defaultCountry={"US"}
                placeholder={`Phone 1`}
                //label={subField}
                name={`phone1`}
                id={`phone1`}
                pattern="[0-9]{3}-[0-9]{2}-[0-9]{3}"
                onChange={(e, d) => update(e, "SET_PHONE_1")}
                value={curPassenger.phone1}
              />
            </BookingFormField>
            <BookingFormField label="Phone 2">
              <PhoneInput
                className={`booking-phone h-10 w-full p-0 border-1 border-black rounded-sm shadow-sm`}
                defaultCountry={"US"}
                placeholder={`Phone 2`}
                //label={subField}
                name={`phone2`}
                id={`phone2`}
                pattern="[0-9]{3}-[0-9]{2}-[0-9]{3}"
                onChange={(e) => update(e, "SET_PHONE_2")}
                value={curPassenger.phone2}
              />
            </BookingFormField>
            <BookingFormField label="VIP Number">
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`VIP Number`}
                //label={subField}
                name={`vipNumber`}
                onChange={(e, d) => update(e.target.value, "SET_VIP_NUMBER")}
                value={curPassenger.middleName}
              />
            </BookingFormField>
            <BookingFormField label="Fare Code">
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`Fare Code`}
                //label={subField}
                name={`fareCode`}
                onChange={(e, d) => update(e.target.value, "SET_FARE_CODE")}
                value={curPassenger.fareCode}
              />
            </BookingFormField>
          </div>
        </AccordionBody>
      </Accordion>
      <h4>Document Info</h4>
      <div className="secondary-info flex flex-row flex-wrap justify-evenly bg-gray-200">
        <BookingFormField label="Document Type">
          <Select
            className={`booking-select`}
            //placeholder={label}
            options={curPassenger.docInfo.typeFields}
            onChange={(e, d) => update(d.value, "SET_DOC_INFO_TYPE")}
            value={curPassenger.docInfo.type}
          />
        </BookingFormField>

        <BookingFormField label="Issue Date">
          <Input
            className={`booking-input`}
            type="date"
            placeholder={`MM/DD/YYYY`}
            //label={subField}
            name={`issueDate`}
            onChange={(e, d) => update(e.target.value, "SET_ISSUE_DATE")}
            value={curPassenger.docInfo.issueDate}
          />
        </BookingFormField>
        <BookingFormField label="Expiry Date">
          <Input
            className={`booking-input`}
            type="date"
            placeholder={`MM/DD/YYYY`}
            //label={subField}
            name={`expiryDate`}
            onChange={(e, d) => update(e.target.value, "SET_EXPIRY_DATE")}
            value={curPassenger.docInfo.expiryDate}
          />
        </BookingFormField>
        <BookingFormField label="Issued By">
          <Select
            className={`booking-select`}
            //placeholder={label}
            options={curPassenger.countries.map((country) => {
              return {
                key: country.abbr,
                value: country.text,
                text: country.text,
              };
            })}
            onChange={(e, d) => update(d.value, "SET_DOC_INFO_COUNTRY")}
            value={curPassenger.docInfo.issueCountry}
          />
        </BookingFormField>
      </div>
      <h4>Address Info</h4>
      <div className="address-info flex flex-row flex-wrap justify-evenly border-t-4 border-b-4">
        <BookingFormField label="Street Address 1:"  required={true}>
          <Input
            className={`booking-input`}
            type="text"
            placeholder={`Address Line 1`}
            //label={subField}
            name={`address1`}
            onChange={(e, d) => update(e.target.value, "SET_ADDRESS_1")}
            value={curPassenger.address.address1}
          />
        </BookingFormField>
        <BookingFormField label="Street Address 2:">
          <Input
            className={`booking-input`}
            type="text"
            placeholder={`Address Line 2`}
            //label={subField}
            name={`address2`}
            onChange={(e, d) => update(e.target.value, "SET_ADDRESS_2")}
            value={curPassenger.address.address2}
          />
        </BookingFormField>
        <BookingFormField label="Country"  required={true}>
          <Select
            className={`booking-select`}
            //placeholder={label}
            options={curPassenger.countries.map((country) => {
              return {
                key: country.abbr,
                value: country.text,
                text: country.text,
              };
            })}
            onChange={(e, d) => update(d.value, "SET_ADDRESS_COUNTRY")}
            value={curPassenger.address.country}
          />
        </BookingFormField>
        <BookingFormField label="State"  required={true}>
          <Input
            className={`booking-input`}
            type="text"
            placeholder={`State`}
            // options={curPassenger.states.map((state) => {
            //   return {
            //     key: state.abbreviation,
            //     value: state.name,
            //     text: state.name,
            //   };
            // })}
            onChange={(e, d) => update(e.target.value, "SET_ADDRESS_STATE")}
            value={curPassenger.address.state}
          />
        </BookingFormField>
        <BookingFormField label="City"  required={true}>
          <Input
            className={`booking-input`}
            type="text"
            placeholder={`City`}
            // options={curPassenger.states.map((state) => {
            //   return {
            //     key: state.abbreviation,
            //     value: state.name,
            //     text: state.name,
            //   };
            // })}
            onChange={(e, d) => update(e.target.value, "SET_ADDRESS_CITY")}
            value={curPassenger.address.city}
          />
        </BookingFormField>
        <BookingFormField label="Zip Code"  required={true}>
          <Input
            className={`booking-input`}
            type="text"
            placeholder={`Zip Code`}
            // options={curPassenger.states.map((state) => {
            //   return {
            //     key: state.abbreviation,
            //     value: state.name,
            //     text: state.name,
            //   };
            // })}
            onChange={(e, d) => update(e.target.value, "SET_ADDRESS_ZIP")}
            value={curPassenger.address.zip}
          />
        </BookingFormField>
      </div>
      <h4>Trip Info</h4>
      <div className="address-info flex flex-row flex-wrap justify-evenly border-t-4 border-b-4">
      <BookingFormField label="Cabin Choice">
              <Select
                className={`booking-select`}
                //placeholder={label}
                options={cabins}
                onChange={(e, d) => update(d.value, "SET_CABIN_TYPE")}
                value={curPassenger.cabinType}
              />
            </BookingFormField>
      <BookingFormField label="Amenities" width="w-full md-w-1/2">
              <div
              className="grid grid-flow-col   justify-evenly  "
              >
                  {curPassenger.amenityChoices.map((amenityChoice) => {
                    return <div className="grid grid-cols-2 align-middle justify-items-center items-center border-1">
                        <label className="text-center text-xs">{amenityChoice}</label>
                        <Checkbox
                        key={amenityChoice}
                        //label={amenityChoice}
                        name={amenityChoice}
                        
                        onChange={(e,d) => update(e.target.value, "SET_AMENITY")}
                        checked={curPassenger.amenities.includes(amenityChoice)}
                        value={amenityChoice}
                        className=""
                                          />
                    </div>
                  })}
              </div>
            </BookingFormField>
      </div>
      {/* <Accordion open={open === 2} className="mb-20">
            <AccordionHeader onClick={() => handleOpen(2)}>
              Document Information
            </AccordionHeader>
            <AccordionBody>
            
            </AccordionBody>
          </Accordion> */}
      {/* <Accordion open={open === 1} className="itinerary">
            <AccordionHeader onClick={() => handleOpen(1)}>
              General Information
            </AccordionHeader>
            <AccordionBody>
             
            </AccordionBody>
          </Accordion> */}
    </div>
  );
};
