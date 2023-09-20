"use client";
import { useContext } from "react";
import { Passenger } from "./BookingComponents.jsx";
import { BookingContext } from "../contexts/BookingContext";

export default function ManualBooking() {
  const {
    passengers,
    setPassengers,
    curPassenger,
    setCurPassenger,
    currentTrip,
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
  return (
    <div>
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
            text={`${currentTrip.itinerary.dates[0].date} - ${currentTrip.itinerary.dates[currentTrip.itinerary.dates.length - 1].date}`}
          />
        </div>
      )}
      <Passenger curPassenger={curPassenger} index={0} />
    </div>
  );
}
