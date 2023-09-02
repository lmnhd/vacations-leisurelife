import Link from "next/link";
import  PropertyRating  from "@/components/PropertyRating";
import Image from "next/image";
import { shipLogos } from "@/app/utils/shiplogos";
import SearchResultsSkeleton from "./search-results-skel";

type props = {
    searchResults: any;
    region: string;
}
export function SearchResults({searchResults, region, ...props}:props) {
  const resultLableStyle = "text-xs";
  const resultValueStyle = "";
  
  return (
    region !== 'LOADING'  ?  
    <div className="flex flex-col ">
        <h1
        className="py-6 text-2xl font-bold text-center font-body text-primary"
        >{region}</h1>
      <ul 
      //className="items-center w-screen h-auto max-h-screen overflow-y-scroll"
      className="items-center h-auto "
      >
        {searchResults
          .sort((a: any, b: any) => {
            a.line.localeCompare(b.line);
          })
          .map((result: any, i: number) => {
            const logo = shipLogos(result.line);
            return (
              <li
                className="my-8 rounded-md shadow-md md:my-2"
                key={i}
                //onClick={() => setLoading(true)}
              >
                <Link
                  href={`/tripresult/${String(result.fdeal).replace(
                    "#",
                    ""
                  )}/${result.shipId}`}
                >
                  {true && (
                    <div className="border-2 text-muted-foreground ">
                      <div className="grid items-center h-40 grid-cols-3 text-sm md:h-auto bg-primary-foreground">
                        <div className="flex items-center justify-between gap-3 md:mx-4 bg-primary">
                          <p className="text-lg font-semibold text-primary-foreground font-body">
                          {result.line} {result.ship.replace(result.line, "")}
                          </p>
                          <div className="hidden md:block">
                            <PropertyRating color="text-primary-foreground"
                            rating={result.rating}
                            showNumber={false}
                            className=""
                            />
                          </div>
                        </div>
                        <p className="font-bold text-center ">#{i + 1}</p>
                        <p className="h-full text-lg font-bold text-center md:mr-4 bg-primary text-primary-foreground">
                          {result.date}{" "}
                        </p>
                      </div>
                      <div 
                      className="flex flex-wrap text-sm justify-evenly"
                    //   className="grid grid-cols-3 gap-4 p-6 my-6 align-middle // md:grid-cols-6 md:gap-1"
                      >
                        {logo &&
                        <div className="search-result-item">
                          <Image
                            alt={result.line}
                            src={logo}
                            width={100}
                            height={100}
                          />
                        </div>}
                        {/* <div className="search-result-item">
                          <p className={resultLableStyle}>CRUISE</p>
                          <p className={resultValueStyle}>{result.fdeal}</p>
                        </div> */}
                         <div className="search-result-item">
                          <p className={resultLableStyle}>LINE</p>
                          <p className={resultValueStyle}>{result.line}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>LENGTH</p>
                          <p className={resultValueStyle}>{result.nights} nights</p>
                        </div>

                        <div className="search-result-item">
                          <p className={resultLableStyle}>DEPART</p>
                          <p className={resultValueStyle}>{result.fromPort}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>RETURN</p>
                          <p className={resultValueStyle}>{result.toPort}</p>
                        </div>
                       
                        {/* <div className="search-result-item">
                          <p className={resultLableStyle}>SHIP</p>
                          <p className={resultValueStyle}>{result.ship}</p>
                        </div> */}
                        {/* <div className="search-result-item">
                          <p className={resultLableStyle}>DATE</p>
                          <p className={resultValueStyle}>{result.date}</p>
                        </div> */}
                        <div className="search-result-item">
                          <p className={resultLableStyle}>RATING</p>
                          <PropertyRating rating={result.rating} />
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>PRICE</p>
                          <p className={resultValueStyle}>Starting at <strong>{result.ourPrice}</strong> Per-Person</p>
                        </div>
                      </div>
                    </div>
                  )}

                 
                </Link>
              </li>
            );
          })}
      </ul>
    </div> : <SearchResultsSkeleton />
     
  )
}
