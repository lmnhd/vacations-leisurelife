"use client";
import { useContext } from "react";
import { Passenger } from "./BookingComponents.jsx";
import { BookingContext } from "../contexts/BookingContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PlusCircleIcon } from "lucide-react";
import { Passenger as passenger } from "../utils/BookingInfo2";

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
    setPassengers([...passengers, new passenger()]);
  };
  const setIndex = (index) => {
    console.log("index = ", index);
    setPassengerIndex(index);
  }
  
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

      <Tabs defaultValue={1}>
        <TabsList className="grid grid-flow-col gap-3 w-fit items-center justify-center mx-auto">
          {passengers.map((passenger, index) => {
            return (
            
                <TabsTrigger 
                value={index + 1}
                key={index}
                //onClick={setIndex(index)}
                >Passenger {index + 1}</TabsTrigger>
              
            );
          })}
          {/* <TabsTrigger value={1}>Passenger 1</TabsTrigger>
          <TabsTrigger value={2}>Passenger 2</TabsTrigger> */}
          <PlusCircleIcon
            onClick={addPassenger}
            className="w-6 h-6 hover:cursor-pointer hover:text-red-300 text-green-700"
          />
        </TabsList>

        {passengers.map((passenger, index) => {
          return (
            <TabsContent key={index} value={index + 1} onFocus={() => setIndex(index)}>
              <Passenger curPassenger={passenger} index={index} />
            </TabsContent>
          );
        })}
        {/* <Passenger curPassenger={curPassenger} index={0} /> */}
      </Tabs>
      {/* <Passenger curPassenger={curPassenger} index={0} /> */}
    </div>
  );
}
