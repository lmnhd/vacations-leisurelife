"use client";

import { useContext, useRef } from "react";
import searchParams from "./searchParams.json";
import { BookingContext } from "../../../contexts/BookingContext";
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
import { Icon } from "@radix-ui/react-select";
import axios from "axios";
import { SearchResults } from "@/components/vtg/search-results";

const sParams: any = searchParams;
const allShipsOBJ = {
  shipID: 0,
  lineID: 0,
  shipName: "All Ships",
  lineName: "Cunard Line",
};
const SearchPage = () => {
  const methods = useForm();
  const {
    searchResults,
    setSearchResults,
    curPassenger,
    passengers,
    showingResults,
    setShowingResults,
    search,
    setSearch,
    header,
    setHeader,
    buttonVisible,
    setButtonVisible,
  } = useContext(BookingContext);
  const formstyle1 =
    "formgroup shadow-md rounded-md bg-primary text-primary w-72";
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
    console.log(nameOfVal + " : " + newval);
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
    const response = await axios.post("/api/vtgSearch", {
      data: search.allVals,
    });
    // const response = await axios({ method: "post", url: "/api/vtg", data: {}})
    console.log(response.data);
    if(typeof response.data === "string"){
      toast.error("Please adjust your search and try again.");
      return;
    }
    setSearchResults(response.data);
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
    shipLineArr.map((val: any) => {
      if (!testArr.includes(val.lineID)) {
        arr.push({
          lineID: val.lineID,
          lineName: val.lineName,
          shipID: val.shipID,
        });
        testArr.push(val.lineID);
      }
    });
    console.log(arr);
    // setLineIDs(arr);
    return (
      <>
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
      </>
    );
  };
  const renderShips = () => {
    let label = "Ship";
    let finalValName = "s";
    let visible = true; //search.allVals.r !== "0";

    let shipLineArr = [allShipsOBJ, ...sParams["sortedShips"]];

    return (
      <>
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
                      .map((shipOB: any) => {
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
      </>
    );
  };
  return (
    <div className="flex flex-col items-center justify-between space-y-12 ">
      <div>
        <h1 className="flex justify-center w-full text-2xl font-bold text-center text-primary">
          Cruise Search
        </h1>
        <p className="text-muted-foreground">
          Search hundreds of Cruise ship departures based on your preferences
        </p>
      </div>
      <FormProvider
        {...methods}

        //className={`z-50 items-center w-full pb-4 mx-auto border-b-200`}
      >
        <div className="">
          <div className="flex flex-wrap items-center justify-center w-full gap-2 px-3 mx-auto align-middle md:mb-0">
            {Object.keys(sParams).map((key, index) => {
              if (key === "sortedShips") {
              } else if (key === "ShipID") {
                {
                  return renderShips();
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
                  <>
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
                  </>
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
            disabled={false}
            onClick={submit}
          >
            {header}
          </Button>
        </div>
      </FormProvider>
      <div className="flex flex-col items-center">
          {searchResults && searchResults.map((result: any, index:number) => {
            return <SearchResults
            region={result.region}
            searchResults={result.deals}
            key={index}
            />
          })}
      </div>     
      
    </div>

    
  );
};

export default SearchPage;
