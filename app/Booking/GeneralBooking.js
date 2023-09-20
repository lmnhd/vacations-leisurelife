import { useState } from "react";
// import searchParams from "../../searchCruiseAPI/searchParams.json";
// import { BookingInfo, passenger } from "./BookingInfo";
import {
  CabinType,
  Gender,
  Passenger,
  TransportationMode,
} from "./BookingInfo2";
import { Checkbox, Input } from "@material-tailwind/react";
import { Dropdown, Form, FormInput, Label, Select } from "semantic-ui-react";

export default function GeneralBooking() {
  const pass = new Passenger();
  pass.cabinType = 0;
  pass.gender = 0;
  const selectVals = {
    gender: [
      { key: 0, value: 0, text: "Select Gender" },
      { key: 1, value: 1, text: "Female" },
      { key: 2, value: 2, text: "Male" },
      { key: 3, value: 3, text: "Other" },
    ],
    cabinType: [
      { key: 0, value: 0, text: "Select Cabin Type" },
      { key: 1, value: 1, text: "Inside" },
      { key: 2, value: 2, text: "Ocean View" },
      { key: 3, value: 3, text: "Suite" },
      { key: 4, value: 4, text: "Other" },
    ],
    transportationMode: [
      { key: 0, value: true, text: "Air" },
      { key: 1, value: false, text: "Shuttle" },
      { key: 2, value: false, text: "Ride Share" },
      { key: 3, value: false, text: "Taxi" },
      { key: 4, value: false, text: "Train" },
      { key: 5, value: false, text: "Bus" },
      { key: 6, value: false, text: "Other" },
    ],
  };

  const [fieldValues, setFieldValues] = useState({
    Passenger: new Passenger(),
  });
  const handleChange = (name, value, section, subSection) => {
    console.log(`${name}:${value}`);
    console.log(value);
    //console.log(test)
    let newSection = {};
    if (subSection) {
      const newSubSection = {
        ...fieldValues[section][subSection],
        [name]: value,
      };
      newSection = { ...fieldValues[section], [subSection]: newSubSection };
    } else {
      newSection = { ...fieldValues[section], [name]: value };
    }
    setFieldValues({
      ...fieldValues,
      [section]: newSection,
    });
  };
  const handleMultiCheckChange = (name, value, section, index) => {
    console.log(`${name}:${value}`);
    console.log(value);
    //console.log(test)
    const newArr = fieldValues[section][name].map((ob, i) => {
      if (ob.key == index) {
        return { ...ob, value: !ob.value };
      } else {
        return ob;
      }
    });
    //console.log(newArr);
    const newSection = { ...fieldValues[section], [name]: newArr };
    setFieldValues({
      ...fieldValues,
      [section]: newSection,
    });
  };
  const classNames = "w-1/2 bg-black"
  const getLabel = (name) => {
    switch (name) {
      case "firstName":
        return "First Name";
        break;
      case "lastName":
        return "Last Name";
        break;
      case "age":
        return "Age";
        break;
      case "gender":
        return "Gender";
        break;
      case "address":
        return "Address";
        break;
      case "state":
        return "State/Province";
        break;
      case "city":
        return "City";
        break;
      case "zip":
        return "Zip Code";
        break;
      case "number":
        return "Address Number";
        break;
      case "street":
        return "Address Street";
        break;
      case "phone":
        return "Phone";
        break;
      case "email":
        return "Email";
        break;
      case "cabinType":
        return "Preferred Cabin Type";
        break;
      case "transportationMode":
        return "Need Transportation?";
        break;

      default:
        return "";
        break;
    }
  };
  const __renderFirst = () => {
    {
      return Object.keys(fieldValues.Passenger).map((field, i) => {
        //console.log(typeof fieldValues.Passenger[field]);
       
        if (field == "address") {
          return Object.keys(fieldValues.Passenger[field]).map(
            (subField, subI) => {
              console.log(subField);
              const label = getLabel(subField)
              return (
                <Input
                key={subI}
                  className={classNames}
                  type="text"
                  placeholder={label}
                  //label={subField}
                  name={subField}
                  onChange={(e) =>
                    handleChange(
                      e.target.name,
                      e.target.value,
                      "Passenger",
                      field
                    )
                  }
                  value={fieldValues.Passenger[field][subField]}
                />
              );
            }
          );
        }
        if (field == "age") {
          return (
            
              <Input
              key={i}
              className={classNames}
                type="number"
                control="input"
                placeholder={field}
                max={100}
                //label={field}
                name={field}
                onChange={(e) =>
                  handleChange(e.target.name, e.target.value, "Passenger")
                }
                value={fieldValues.Passenger[field]}
              />
           
          );

          // console.log(fieldValues.Passenger[field])
          // console.log(field)
        }

        {if (field !== "gender" && field !== "transportationMode" && field !== "cabinType"){
          return (
            <Input
            className="w-1/2"
              type="text"
              placeholder={field}
              //label={field}
  
              name={field}
              onChange={(e) =>
                handleChange(e.target.name, e.target.value, "Passenger")
              }
              value={fieldValues.Passenger[field]}
            />
          );
        } }

        // console.log(fieldValues.Passenger[field])
        // console.log(field)
      });
    }
  };
  const __renderSecond = () => {
    {
      return Object.keys(fieldValues.Passenger).map((field, i) => {
        //console.log(typeof fieldValues.Passenger[field]);

        // SELECTS
        if (field === "gender" || field === "cabinType") {
          const label = getLabel(field);
          // console.log("checking")
          console.log(fieldValues.Passenger[field]);
          console.log(typeof fieldValues.Passenger[field]);
          console.log(label);
          return (
            <Form.Field width={"10"} key={i}>
              <Select
              key={i}
                labeled
                fluid
                className={classNames}
                placeholder={label}
                options={selectVals[field]}
                onChange={(e, d) => handleChange(field, d.value, "Passenger")}
                value={fieldValues.Passenger[field]}
              />
            </Form.Field>
          );

          // console.log(fieldValues.Passenger[field])
          // console.log(field)
        }

        // MULTISELECTS
        if (field === "transportationMode" || field == "") {
          const label = getLabel(field);
          // console.log("checking")
          console.log(fieldValues.Passenger[field]);
          console.log(typeof fieldValues.Passenger[field]);
          console.log(label);
          return (
            <div className="" key={field}>
              <Label
                content={label}
                className={`w-full`}
              ></Label>
              <div className="flex flex-row flex-wrap  bg-gray-100 border-2 p-0 shadow-sm">
                {fieldValues.Passenger[field].map((option, i) => {
                  return (
                    <Checkbox
                      key={i}
                      label={option.text}
                      name={option.key}
                      onChange={(e) =>
                        handleMultiCheckChange(
                          field,
                          e.target.checked,
                          "Passenger",
                          i
                        )
                      }
                      checked={option.value}
                      value={option.value}
                      className="mx-2"
                    />
                  );
                })}
              </div>
            </div>
          );
        }

        console.log(fieldValues);
        // const newPassenger = {...fieldValues.Passenger, age:3};
        // setFieldValues({...fieldValues, passenger: newPassenger })
      });
    }
   
  };
  return (
    <div className="grid grid-rows-2">
      <div className="bg-gray-100 border-2 border-gray-800 shadow-sm m-4">
        {__renderFirst()}
      </div>
      <div className="bg-gray-600 border-2 border-gray-800 shadow-sm m-4">
        {__renderSecond()}
      </div>
    </div>
  );
}
