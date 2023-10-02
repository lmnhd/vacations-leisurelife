"use client";
import { useContext } from "react";
import { Passenger } from "./BookingComponents.jsx";
import { BookingContext } from "../contexts/BookingContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PlusCircleIcon, DeleteIcon } from "lucide-react";
import { Passenger as passenger } from "../utils/BookingInfo2";
import { useForm } from "react-hook-form";

export default function ManualBooking() {
  const {
    passengers,
    setPassengers,
    curPassenger,
    setCurPassenger,
    currentTrip,
    setPassengerIndex,
    passengerIndex,
  } = useContext(BookingContext);
  const BookFormShipWrapper = ({ header, text }) => {
    return (
      <div className="book-form-ship-info">
        <div className="flex flex-auto gap-3 text-lg">
          <p className="font-bold">{header}:</p>
          <p>{text}</p>
        </div>
      </div>
    );
  };
  const addPassenger = () => {
    if(passengers.length >= 5) return;
    setPassengers([...passengers, new passenger()]);
  };
  const removePassenger = (index) => {
    if(passengers.length <= 1) return;
    let newPassengers = [...passengers];
    newPassengers.splice(index, 1);
    setPassengers(newPassengers);
  }
  const setIndex = (index) => {
    console.log("index = ", index);
    setPassengerIndex(index);
  }
 

  const onFormSubmit = (data) => {
   
    //console.log(data);
    console.log(passengers)
  };
  return (
    <div>
      {/* <Button
          //type="submit"
          className="mx-auto w-20 rounded-sm bg-blue-500 p-4  hover:cursor-pointer hover:bg-green-500"
        >SUBMIT</Button> */}
      {currentTrip && (
        <div className="text-center w-full ">
          <BookFormShipWrapper
            header="Cruise Line"
            text={currentTrip.mainInfo.cruiseLine}
          />
          <BookFormShipWrapper
            header="Trip"
            text={currentTrip.mainInfo.dealName}
          />
          <BookFormShipWrapper
            header="Ship"
            text={currentTrip.mainInfo.shipName}
          />
          <BookFormShipWrapper
            header="Port"
            text={currentTrip.ports[0].portName}
          />
          <BookFormShipWrapper
            header="Dates"
            text={`${currentTrip.itinerary.dates[0].date} - ${
              currentTrip.itinerary.dates[
                currentTrip.itinerary.dates.length - 1
              ].date
            }`}
          />
        </div>
      )}

      <div 
     // onSubmit={handleSubmit(onFormSubmit)}
      //onSubmit={onFormSubmit}
      >
      {/* <input
          type="submit"
          //onClick={() => console.log(passengers)}
          className="mx-auto w-20 rounded-sm bg-blue-500 p-4  hover:cursor-pointer hover:bg-green-500"
          content="Submit"
        /> */}
        <Tabs defaultValue='Cabin1'>
          <TabsList className="grid grid-flow-col gap-3 w-fit items-center justify-center mx-auto">
            {/* {passengers.map((passenger, index) => {
              return ( */}
        
                  <div className="flex flex-row">
                    <TabsTrigger
                    value='Cabin1'
                    //key={index}
                    //onClick={() => setIndex(index)}
                    >Cabin 1</TabsTrigger>
                    
                  </div>
        
              {/* );
            })} */}
            {/* <TabsTrigger value={1}>Passenger 1</TabsTrigger>
            <TabsTrigger value={2}>Passenger 2</TabsTrigger> */}
            <PlusCircleIcon
              onClick={addPassenger}
              className="w-6 h-6 hover:cursor-pointer hover:text-red-300 text-green-700"
            />
          </TabsList>
          <TabsContent 
              // key={index} 
              value='Cabin1'
              //onFocus={() => setIndex(index)}
              >
          {passengers.map((passenger, index) => {
            return (
             
                // <div onFocus={() => setIndex(index)}>
                  <Passenger 
                  key={index}
                  curPassenger={passenger} 
                  //index={index} 
                  passengers={passengers} 
                  removePassenger={removePassenger} 
                  //register={register} errors={errors} 
                  passengerIndex={passengerIndex}
                  onFormSubmit={onFormSubmit} />
                // </div>
              
            );
          })}
          {/* <Passenger curPassenger={curPassenger} index={0} /> */}
          </TabsContent>
        </Tabs>
      </div>
      {/* <Passenger curPassenger={curPassenger} index={0} /> */}
    </div>
  );
}
