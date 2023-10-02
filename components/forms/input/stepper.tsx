"use client";

import { type } from "os";
import React, { useState, ChangeEvent, FC } from "react";

type StepperProps = {
  CurrentValue: number;
  MaxValue: number;
  MinValue: number;
  onChange: (value: number) => void;
};
export default function Stepper({
  CurrentValue,
  MaxValue,
  MinValue,
    onChange,
}: StepperProps) {
  enum Step {
    up,
    down,
  }
  const [currentValue, setCurrentValue] = useState(CurrentValue);
  const [maxValue, setMaxValue] = useState(MaxValue);
  const [minValue, setMinValue] = useState(MinValue);
  

  function handleIncrement(upOrDown: Step) {
    console.log("upOrDown", upOrDown);
    
    if (upOrDown === Step.up) {
      if (currentValue < maxValue) {
        setCurrentValue(currentValue + 1);
        onChange(currentValue + 1);
      }
    } else {
      if (currentValue > minValue) {
        setCurrentValue(currentValue - 1);
        onChange(currentValue - 1);
      }
    }

  }

  //console.log("currentValue", currentValue);

  return (
    <div className="flex space-x-1 justify-center items-center text-2xl">
      <button
        className="flex  items-center justify-center bg-gray-200 w-8 h-8 border-2 border-gray-400 text-black"
        onClick={() => handleIncrement(Step.down)}
      >
        -
      </button>
      <span className="w-5 mx-auto text-center text-white">{currentValue}</span>
      <button
        className="flex  items-center justify-center bg-gray-200 w-8 h-8 border-2 border-gray-400 text-black"
        onClick={() => handleIncrement(Step.up)}
      >
        +
      </button>
    </div>
  );
}
