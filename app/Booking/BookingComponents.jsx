import { Children, useContext, useState } from "react";
import { BookingContext } from "../contexts/BookingContext";
import { useForm } from "react-hook-form";
//import { Passenger as passengerOBJ } from "./BookingInfo2";
//import { Select } from "semantic-ui-react";
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
import {
  Accordion,
  AccordionHeader,
  AccordionBody,
  Checkbox,
} from "@material-tailwind/react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";


const BookingFormField = ({
  label,
  children,
  required = false,
  width = `w-80`,
}) => {
  return (
    <div
      className={`booking-form-field grid grid-flow-row justify-items-center ${width}`}
    >
      <label className="bg-gray-100 w-full font-semibold rounded-none">
        <span>
          {label}
          {required && <i className="text-red-500 font-body"> * </i>}
        </span>
      </label>
      {children}
    </div>
  );
};
export const Passenger = ({ curPassenger, index }) => {
  

  const { setCurPassenger, currentTrip } = useContext(BookingContext);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();
  const [open, setOpen] = useState(1);
  const handleOpen = (value) => setOpen(open === value ? 0 : value);

  const update = (value, type) => {
    setCurPassenger({ value, type: type });
  };
  const onSubmit = (data) => {
    console.log(curPassenger);
  };
  //console.log(curPassenger);
  let cabins = curPassenger.cabinTypeFields;

  if (currentTrip) {
    const cabinsList = currentTrip.mainInfo.prices.map((cabin) => {
      return {
        key: `${String(cabin[1].label).replace("Our", "")} (${
          cabin[1].amount
        } )`,
        value: `${String(cabin[1].label).replace("Our", "")} (${
          cabin[1].amount
        })`,
        text: `${String(cabin[1].label).replace("Our", "")} (${
          cabin[1].amount
        } per-person)`,
      };
    });
    cabins = cabinsList;
  }
  // if(user){
  //   update(user.firstName, "SET_FIRST_NAME");
  //   update(user.lastName, "SET_LAST_NAME");
  //   update(user.primaryEmailAddress.emailAddress, "SET_EMAIL");
  // }
  return (
    <form onSubmit={handleSubmit(onSubmit)} className=" mb-10 ">
      <div className="flex sticky top-0 z-50">
       
        <div className="flex flex-col items-center">

          <h1>Passenger #{index ? index + 1 : 1}</h1>
          <p className="text-blue-600 underline">{curPassenger.firstName}</p>
        </div>
      </div>

      <Accordion open={open === 1} className="">
        <AccordionHeader onClick={() => handleOpen(1)}>
          Main Info
        </AccordionHeader>
        <AccordionBody className="">
          <div className="booking-section  flex flex-row gap-4 flex-wrap justify-evenly border-t-4 border-b-4 ">
            <BookingFormField label="Pax Type">
              <Select
                value={curPassenger.paxType}
                //onValueChange={(e) => console.log(e)}
                onValueChange={(e) => update(e, "SET_PAX")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="PAX Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>PAX Type</SelectLabel>
                    {curPassenger.paxTypeFields.map((paxType) => {
                      return (
                        <SelectItem key={paxType.key} value={paxType.key}>
                          {paxType.text}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </BookingFormField>
            <BookingFormField label="Title">
              <Select onValueChange={(e) => update(e, "SET_TITLE")}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Title" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Title</SelectLabel>
                    {curPassenger.titleFields.map((title) => {
                      return (
                        <SelectItem key={title.key} value={title.key}>
                          {title.text}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </BookingFormField>
            <BookingFormField label="First Name" required={true}>
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`First Name`}
                //defaultValue={user.firstName}
                //label={subField}
                name={`firstName`}
                onChangeCapture={(e) =>
                  update(e.target.value, "SET_FIRST_NAME")
                }
                //onChangeCapture={(e) => {console.log(e.target.value)}}
                //onChange={(e) => {console.log(e)}}
                value={curPassenger.firstName}
                {...register("firstName", { required: true, maxLength: 20 })}
              />
              {errors.firstName?.type === "required" && (
                <p role="alert">First name is required</p>
              )}
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
            <BookingFormField label="Last Name" required={true}>
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`Last Name`}
                //defaultValue={user.lastName}
                //label={subField}
                name={`lastName`}
                onChangeCapture={(e, d) =>
                  update(e.target.value, "SET_LAST_NAME")
                }
                value={curPassenger.lastName}
                {...register("lastName", { required: true, maxLength: 20 })}
              />
              {errors.lastName?.type === "required" && (
                <p role="alert">Last name is required</p>
              )}
            </BookingFormField>
            <BookingFormField label="Age" required={true}>
              <Input
                className={`booking-input`}
                type="number"
                placeholder={`Please Enter Age`}
                //label={subField}
                name={`age`}
                onChangeCapture={(e, d) => update(e.target.value, "SET_AGE")}
                value={curPassenger.age}
                min="2"
                max="120"
                {...register("age", {
                  required: true,
                  min: 2,
                  max: 120,
                  maxLength: 3,
                  minLength: 1,
                })}
              />
            </BookingFormField>
            <BookingFormField label="Email" required={true}>
              <Input
                className={`booking-input`}
                type="text"
                placeholder={`Email Address`}
                //label={subField}
                name={`email`}
                onChangeCapture={(e, d) => update(e.target.value, "SET_EMAIL")}
                value={curPassenger.email}
                //defaultValue={user.primaryEmailAddress.emailAddress}
                {...register("email", {
                  required: "Email is required",
                  pattern: /^\S+@\S+$/i,
                })}
              />
              {errors.email && <p role="alert">{errors.email?.message}</p>}
            </BookingFormField>
            <BookingFormField label="Phone 1" required={true}>
              <PhoneInput
                className={`booking-phone h-10 w-full p-0 border-1 border-black rounded-sm shadow-sm`}
                defaultCountry={"US"}
                placeholder={`Phone 1`}
                required={true}
                //label={subField}
                name="phone1"
                // id={`phone1`}
                //pattern="[0-9]{3}-[0-9]{2}-[0-9]{3}"
                pattern="^[0-9]? ?\([0-9]{3}\) [0-9]{3}-[0-9]{4}"
                onChange={(e) => update(e, "SET_PHONE_1")}
                //onChange={(e) => console.log(e)}
                //  {...register("phone1", { required: true })}
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
                pattern="^[0-9]? ?\([0-9]{3}\) [0-9]{3}-[0-9]{4}"
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
      {/* <h4>Document Info</h4> */}
      <Accordion open={open === 2} className="">
        <AccordionHeader onClick={() => handleOpen(2)}>
          Document Info
        </AccordionHeader>
        <AccordionBody className="">
          <div className="booking-section flex flex-row gap-4 py-3 flex-wrap justify-evenly bg-yellow-200">
            <BookingFormField label="Document Type">
              <Select onValueChange={(e) => update(e, "SET_DOC_INFO_TYPE")}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select Doc Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Document Type</SelectLabel>
                    {curPassenger.docInfo.typeFields.map((docInfo) => {
                      return (
                        <SelectItem key={docInfo.key} value={docInfo.key}>
                          {docInfo.text}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
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
                //defaultValue={curPassenger.docInfo.issueCountry}
                onValueChange={(e) => update(e, "SET_DOC_INFO_COUNTRY")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Issued By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup className="h-24 overflow-auto">
                    <SelectLabel>Document Type</SelectLabel>
                    {curPassenger.countries.map((country) => {
                      return (
                        <SelectItem key={country.text} value={country.text}>
                          {country.text}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </BookingFormField>
          </div>
        </AccordionBody>
      </Accordion>
      {/* <h4>Address Info</h4> */}
      <Accordion open={open === 3} className="">
        <AccordionHeader onClick={() => handleOpen(3)}>
          Address Info
        </AccordionHeader>
        <AccordionBody className="">
          <div className="booking-section flex flex-row gap-4 flex-wrap justify-evenly border-t-4 border-b-4 bg-blue-300">
            <BookingFormField label="Street Address 1:" required={true}>
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
            <BookingFormField label="Country" required={true}>
              <Select onValueChange={(e) => update(e, "SET_ADDRESS_COUNTRY")}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup className="h-20 overflow-auto">
                    <SelectLabel>Country</SelectLabel>
                    {curPassenger.countries.map((country) => {
                      return (
                        <SelectItem key={country.text} value={country.text}>
                          {country.text}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </BookingFormField>
            <BookingFormField label="State" required={true}>
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
            <BookingFormField label="City" required={true}>
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
            <BookingFormField label="Zip Code" required={true}>
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
        </AccordionBody>
      </Accordion>
      {/* <h4>Trip Info</h4> */}
      <Accordion open={open === 4} className="">
        <AccordionHeader onClick={() => handleOpen(4)}>
          Trip Info
        </AccordionHeader>
        <AccordionBody className="">
          <div className="booking-section address-info flex flex-row gap-4 flex-wrap justify-evenly border-t-4 border-b-4 bg-yellow-200">
            <BookingFormField label="Cabin Choice">
              <Select onValueChange={(e) => update(e, "SET_CABIN_TYPE")}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select Cabin Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Cabin Choices</SelectLabel>
                    {curPassenger.cabinTypeFields.map((cabin) => {
                      return (
                        <SelectItem key={cabin.key} value={cabin.key}>
                          {cabin.text}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {/* <Select
            className={`booking-select`}
            //placeholder={label}
            options={cabins}
            onChange={(e, d) => update(d.value, "SET_CABIN_TYPE")}
            value={curPassenger.cabinType}
          /> */}
            </BookingFormField>
            <BookingFormField label="Amenities" width="w-full md-w-1/2">
              <div className="grid grid-flow-row   justify-evenly  ">
                {curPassenger.amenityChoices.map((amenityChoice) => {
                  return (
                    <div
                      key={amenityChoice}
                      className="grid grid-cols-2 align-middle justify-items-center items-center border-1"
                    >
                      <label className="text-center text-xs">
                        {amenityChoice}
                      </label>
                      <Checkbox
                        key={amenityChoice}
                        //label={amenityChoice}
                        name={amenityChoice}
                        onChange={(e, d) =>
                          update(e.target.value, "SET_AMENITY")
                        }
                        checked={curPassenger.amenities.includes(amenityChoice)}
                        value={amenityChoice}
                        className=""
                      />
                    </div>
                  );
                })}
              </div>
            </BookingFormField>
          </div>
        </AccordionBody>
      </Accordion>
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
      
    </form>
  );
};
