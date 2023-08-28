"use client";
import TypewriterComponent from 'typewriter-effect';
import { useAuth } from "@clerk/nextjs";
import Link from 'next/link';
import { Button } from './ui/button';

export const LandingHero = () => {
  const { isSignedIn } = useAuth();
  return (
  <div className="space-y-5 font-bold text-center text-white py-36">
    <div className="space-y-5 text-4xl font-extrabold sm:text-5xl md:text-6xl lg:text-7xl">
        <h1>Your source for finding</h1>
        <div className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          <TypewriterComponent
          options={{
            strings: [
              'Cruise Deals', 
              'Travel Packages', 
              'Themed Cruises', 
              'Group Cruises', 
              'Luxury Cruises'], 
              autoStart: true, 
              loop: true, 
              delay: 50, 
              deleteSpeed: 50
          }}
          />
        </div>
        <div className='text-sm font-light md:text-xl text-zinc-400'>
          <p>Leisure Life Vacations is a full service travel agency that specializes in all-inclusive vacation cruises.</p>
        </div>
        <div>
          <Link href={isSignedIn ? "/dashboard" : "sign-up"}>
            <Button variant="premium" className='p-4 font-semibold rounded-full md:text-lg md:p-6'> 
              Search Cruises
            </Button>
          </Link>
        </div>
    </div>
  </div>
  )
};
