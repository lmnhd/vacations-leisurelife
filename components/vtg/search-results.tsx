import Link from "next/link";
import  PropertyRating  from "@/components/PropertyRating";

type props = {
    searchResults: any;
    region: string;
}
export function SearchResults({searchResults, region, ...props}:props) {
  const resultLableStyle = "";
  const resultValueStyle = "";
  return (
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
            return (
              <li
                className="rounded-md shadow-md"
                key={i}
                //onClick={() => setLoading(true)}
              >
                <Link
                  href={`/searchresult/${String(result.fdeal).replace(
                    "#",
                    ""
                  )}/${result.shipId}`}
                >
                  {true && (
                    <div className="text-muted-foreground ">
                      <div className="grid grid-cols-3 py-4 bg-primary-foreground">
                        <p className="mx-6 text-lg font-bold font-body">
                          {result.ship}
                        </p>
                        <p className="text-xl font-bold text-center">{i + 1}</p>
                        <p className="h-full mr-4 text-lg text-right">
                          {result.date}{" "}
                        </p>
                      </div>
                      <div 
                      className="flex flex-wrap text-sm justify-evenly"
                    //   className="grid grid-cols-3 gap-4 p-6 my-6 align-middle // md:grid-cols-6 md:gap-1"
                      >
                        <div className="search-result-item">
                          <p className={resultLableStyle}>CRUISE</p>
                          <p className={resultValueStyle}>{result.fdeal}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>NIGHTS</p>
                          <p className={resultValueStyle}>{result.nights}</p>
                        </div>

                        <div className="search-result-item">
                          <p className={resultLableStyle}>DEPART</p>
                          <p className={resultValueStyle}>{result.fromPort}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>RETURN</p>
                          <p className={resultValueStyle}>{result.toPort}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>LINE</p>
                          <p className={resultValueStyle}>{result.line}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>SHIP</p>
                          <p className={resultValueStyle}>{result.ship}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>DATE</p>
                          <p className={resultValueStyle}>{result.date}</p>
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>RATING</p>
                          <PropertyRating rating={result.rating} />
                        </div>
                        <div className="search-result-item">
                          <p className={resultLableStyle}>PRICE</p>
                          <p className={resultValueStyle}>Starting at <strong>{result.ourPrice}</strong> Per-Cabin</p>
                        </div>
                      </div>
                    </div>
                  )}

                 
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
