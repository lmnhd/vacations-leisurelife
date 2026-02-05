"use client";

import React, { useContext, useRef } from "react";
import searchParams from "@/components/vtg/searchParams.json"
import { BookingContext } from "@/app/contexts/BookingContext";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { object } from "zod";
import { Button } from "@/components/ui/button";

import axios from "axios";
import { SearchResults } from "@/components/vtg/search-results";
import { Container1, Container1Header } from "../containers/container1";
import LogoStrip from "@/components/logoStrip"
import { generateMonthOptions } from "@/lib/date-utils";

const sParams: any = {
  ...searchParams,
  SMonth: generateMonthOptions("From month"),
  TMonth: generateMonthOptions("To month")
};
const allShipsOBJ = {
  shipID: 0,
  lineID: 0,
  shipName: "All Ships",
  lineName: "Cunard Line",
};
function SearchUI({setLoading, setShowResults,setSearchResults}: 
    {setLoading:any, setShowResults: any, setSearchResults: any}){
  const methods = useForm();
  const {
   
    search,
    setSearch,
    header,

    setHeader,
    buttonVisible,
    setButtonVisible,
  } = useContext(BookingContext);
  const formstyle1 =
    "formgroup shadow-md rounded-md bg-primary text-primary text-center w-72";
  const resultLableStyle = "font-serif  text-center  align-center";
  const resultValueStyle = "text-center text-white";
  const fieldColorOn = `bg-blue-500 text-white`;
  //const fieldColorOff = `${textColor}`;
  const fieldColorOff = `text-pink`;
  const headerRef = useRef("Search Cruises");
  const usPorts = [
    "Boston, MA",
    "Juneau, AK",
    "New Orleans, LA",
    "Portland, ME",
    "San Diego, CA",
    "Sitka, AK",
    "Miami, FL",
    "Port Canaveral, FL",
    "Seattle, WA",
    "Tampa, FL",
    "Fort Lauderdale, FL",
    "San Francisco, CA",
    "Galveston, TX",
    "Charleston, SC",
    "Baltimore, MD",
    "Norfolk, VA",
    "Amelia Island, FL",
    "Mobile, AL",
    "Jacksonville, FL",
    "Florida (Any Port)",
    "Bayonne, NJ",
    "New York, NY",
    "Anchorage, AK",
    "Milwaukee, WI",
    "Los Angeles, CA",
    "Chicago (Navy Pier), IL",
    "United States (Any Port)",
    "Catalina Island, CA",
    "Haines, AK",
    "Nawiliwili, Kauai, HI",
    "Hilo, Hawaii, HI",
    "Kona, Hawaii, HI",
    "College Fjord, AK",
    "Astoria, OR",
  ];
  const updateSearch = async (newval: string, nameOfVal: string) => {
    //shipSelect.current.value = 0
    //console.log(nameOfVal + " : " + newval);
    let newSearchOBJ = {};

    if (nameOfVal == "l") {
      newSearchOBJ = { ...search.allVals, [nameOfVal]: newval, s: 0 };
    } else {
      newSearchOBJ = { ...search.allVals, [nameOfVal]: newval };
    }
    setSearch({ ...search, allVals: newSearchOBJ });
    console.log(newSearchOBJ);
  };
  const submit = async () => {
    setLoading(true);
    setSearchResults([{ region: "LOADING", deals: [] }])
    setShowResults(true);
    const response = await axios.post("/api/vtgSearch", {
      data: search.allVals,
    });
    // const response = await axios({ method: "post", url: "/api/vtg", data: {}})
    //if (!response.data) { return;}
    console.log(response.data);
    if (typeof response.data !== "object") {
      toast.error("Please make one or more additional search selections.");
      setShowResults(false);
      setLoading(false);
      return;
    }
    setSearchResults(response.data);
    setLoading(false);
  };
  const renderLines = (obj: any, key: string) => {
    const shipLineArr = sParams["sortedShips"];
    let finalValName = "l";
    let label = "Line";
    let testArr: any = [];
    let arr: any = [];
    let visible = true; //search.allVals.r !== "0";
    arr.push({
      lineID: 0,
      lineName: "All Cruise Lines",
      shipID: 0,
    });
    shipLineArr.map((val: any, index: number) => {
      if (!testArr.includes(val.lineID)) {
        arr.push({
          lineID: val.lineID,
          lineName: val.lineName,
          shipID: val.shipID,
        });
        testArr.push(val.lineID);
      }
    });
    //console.log(arr);
    // setLineIDs(arr);
    return (
      <React.Fragment key={key}>
        {visible && (
          <div className={formstyle1}>
            <FormField
              //className="m-2 "

              name={finalValName}
              render={() => (
                <FormItem>
                  <FormLabel className="text-primary-foreground">
                    {label}
                  </FormLabel>
                  <Select
                    //label={label}
                    onValueChange={(val: any) =>
                      updateSearch(val, finalValName)
                    }
                    defaultValue={search.allVals[finalValName]}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Option" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="overflow-auto max-h-96">
                      {arr
                        .sort((a: any, b: any) =>
                          a.lineName.localeCompare(b.lineName)
                        )
                        .map((shipLineOB: any) => {
                          return (
                            <SelectItem
                              key={shipLineOB.lineID}
                              value={shipLineOB.lineID}
                            >
                              {shipLineOB.lineName}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
        )}
      </React.Fragment>
    );
  };
  const renderShips = (key: string) => {
    let label = "Ship";
    let finalValName = "s";
    let visible = true; //search.allVals.r !== "0";

    let shipLineArr = [allShipsOBJ, ...sParams["sortedShips"]];

    return (
      <React.Fragment key={key}>
        <div className={formstyle1}>
          <FormField
            //className="m-2 "

            name={finalValName}
            render={() => (
              <FormItem>
                <FormLabel className="text-primary-foreground">
                  {label}
                </FormLabel>
                <Select
                  //label={label}
                  onValueChange={(val: any) => updateSearch(val, finalValName)}
                  defaultValue={search.allVals[finalValName]}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Option" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="overflow-auto max-h-96">
                    {shipLineArr
                      .filter(
                        (ship) =>
                          ship.lineID == search.allVals.l ||
                          ship.lineID == 0 ||
                          search.allVals.l == 0
                      )
                      .map((shipOB: any, index: number) => {
                        return (
                          <SelectItem key={shipOB.shipID} value={shipOB.shipID}>
                            {shipOB.shipName}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>
      </React.Fragment>
    );
  };
  return (
    <div className="flex flex-col items-center justify-between gap-4 ">
      <div className="items-center justify-between w-full mx-3 shadow-sm md:flex"
      >
        
       
          <Container1Header headerText="Cruise Search"/>
        <p className="text-muted-foreground">
          Search hundreds of Cruise ship departures based on your preferences
        </p>
        
       
      </div>
      <FormProvider
        {...methods}

        //className={`z-50 items-center w-full pb-4 mx-auto border-b-200`}
      >
        <div
        className="hidden md:block"
        ><LogoStrip/></div>
        <div className="">
          <div className="flex flex-wrap items-center justify-center w-full gap-2 px-3 mx-auto align-middle md:mb-0">
            {Object.keys(sParams).map((key, index) => {
              if (key === "sortedShips") {
              } else if (key === "ShipID") {
                {
                  return renderShips(key);
                }
              } else if (key == "LineID") {
                {
                  return renderLines(sParams[key], key);
                }
              } else {
                const obj = sParams[key];
                let label = key;
                let finalValName = key;
                let visible = true;

                switch (key) {
                  case "SMonth":
                    label = "From Month";
                    finalValName = "sm";
                    break;
                  case "SDay":
                    label = "From Day";
                    finalValName = "sd";
                    //visible = search.allVals.sm != 0 && search.allVals.tm != 0;
                    break;
                  case "TMonth":
                    label = "To Month";
                    finalValName = "tm";
                    break;
                  case "TDay":
                    label = "To Day";
                    finalValName = "td";
                    //visible = search.allVals.sm != 0 && search.allVals.tm != 0;
                    break;
                  case "RegionID":
                    label = "Region";
                    finalValName = "r";
                    break;
                  case "LineID":
                    label = "Line";
                    finalValName = "l";
                    //visible = search.allVals.r !== '0' ;
                    break;
                  case "ShipID":
                    label = "Ship";
                    finalValName = "s";
                    //visible = search.allVals.r !== '0' ;
                    break;
                  case "Length":
                    label = "Number of Nights";
                    finalValName = "n";
                    //visible = search.allVals.r !== "0";
                    break;
                  case "DPortID":
                    label = "Departing Port";
                    finalValName = "d";
                    //visible = search.allVals.r != 0;
                    break;
                  case "VPortID":
                    label = "Visiting Port";
                    finalValName = "v";
                    //visible = search.allVals.r != 0;
                    break;
                }

                return (
                  <React.Fragment key={key}>
                    {visible && (
                      <div className={formstyle1}>
                        <FormField
                          //className="m-2 "

                          name={finalValName}
                          render={() => (
                            <FormItem>
                              <FormLabel className="mx-auto font-light text-center text-primary-foreground">
                                {label}
                              </FormLabel>
                              <Select
                                //label={label}
                                onValueChange={(val: any) =>
                                  updateSearch(val, finalValName)
                                }
                                defaultValue={search.allVals[finalValName]}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select Option" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="overflow-auto max-h-96">
                                  {Object.keys(obj)
                                    .sort((a, b) => {
                                      //console.log(obj[a]+ '-' + obj[b])
                                      //console.log(key)
                                      if (key == "SMonth" || key == "TMonth") {
                                        var ayear = Number(a.substring(0, 4));
                                        var amonth = Number(a.substring(4, 6));
                                        var byear = Number(b.substring(0, 4));
                                        var bmonth = Number(b.substring(4, 6));
                                        if (ayear < byear) {
                                          return -1;
                                        }
                                        if (ayear > byear) {
                                          return 1;
                                        }
                                        if (ayear == byear) {
                                          return amonth > bmonth ? 1 : -1;
                                        }
                                      } else if (
                                        key == "DPortID" ||
                                        key == "VPortID"
                                      ) {
                                        if (
                                          usPorts.includes(obj[a]) &&
                                          !usPorts.includes(obj[b])
                                        ) {
                                          return -1;
                                        } else if (
                                          !usPorts.includes(obj[a]) &&
                                          usPorts.includes(obj[b])
                                        ) {
                                          return 1;
                                        }
                                      } else {
                                        return 1;
                                      }
                                      return 0;
                                    })
                                    .map((key) => {
                                      return (
                                        <SelectItem key={key} value={key}>
                                          {obj[key]}
                                        </SelectItem>
                                      );
                                    })}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              }
            })}
          </div>
        </div>
        <div className="flex flex-wrap justify-center max-w-lg gap-6 mx-auto shadow-sm">
          <Button
            className={` mx-6 my-3 text-center ${
              buttonVisible
                ? "text-primary-foreground text-lg" + ""
                : "text-primary-foreground"
            } shadow-sm `}
            disabled={search.allVals.tm == '0' || search.allVals.sm == '0'}
            onClick={submit}
          >
            {header}
          </Button>
        </div>
      </FormProvider>
    </div>
  );
};

export default SearchUI;
