"use client";
import { BookingContext } from "@/app/contexts/BookingContext";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/vtg/search-results";
import SearchUI from "@/components/vtg/searchui";
import React, { useContext, Suspense, useState, useEffect } from "react";
import { Dimmer, Loader, Segment } from "semantic-ui-react";

export default function SearchPage() {
  const { searchResults, setSearchResults } = useContext(BookingContext);
  const [loadingState, setLoadingState] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    setSearchResults([{ region: "LOADING", deals: [] }]);
    console.log(searchResults);
  }, []);

  return (
    <div className="p-2">
      {showResults && (
        <Button 
        className="sticky top-0 w-full p-2 my-2 text-center rounded-md shadow-md bg-primary text-primary-foreground z-[80]"
        onClick={() => setShowResults(!showResults)}
        >
          Modify Search
        </Button>
      )}
      {!showResults && <SearchUI 
      setSearchResults={setSearchResults}
      setShowResults={setShowResults}
      setLoading={setLoadingState} 
      />}

      {showResults && (
        <div className="flex flex-col items-center">
          {searchResults &&
            searchResults.map((result: any, index: number) => {
              console.log(result);
              return (
                <SearchResults
                  region={result.region}
                  searchResults={result.deals}
                  key={index}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
