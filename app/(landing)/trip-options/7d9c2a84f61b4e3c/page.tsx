import Image from "next/image";
import type { Metadata } from "next";
import { ArrowUpRight, CalendarDays, MapPin, Ship } from "lucide-react";
import logo from "@/public/llv logo_color_sept23-3.png";

export const metadata: Metadata = {
  title: "Spring 2027 Cruise Ideas | Leisure Life Vacations",
  description: "A personal spring 2027 cruise shortlist with balcony options from Port Canaveral and a Hawaii sailing.",
  robots: { index: false, follow: false },
};

type CruiseOffer = {
  cruiseLine: string;
  ship: string;
  dates: string;
  nights: string;
  departure: string;
  itinerary: string;
  perPerson: string;
  coupleTotal: string;
  bookingHref: string;
  bookingLabel: string;
  shipHref: string;
  note?: string;
  featured?: boolean;
};

const offers: CruiseOffer[] = [
  {
    cruiseLine: "Royal Caribbean",
    ship: "Utopia of the Seas",
    dates: "February 26–March 1, 2027",
    nights: "3 nights",
    departure: "Port Canaveral, Florida",
    itinerary: "Nassau · Perfect Day at CocoCay",
    perPerson: "$794.06",
    coupleTotal: "$1,588.12",
    bookingHref: "https://bookings.cbagenttools.com/swift/cruise/package/UT03PCN-3464558580?siid=1049337&lang=1",
    bookingLabel: "View this sailing",
    shipHref: "https://www.royalcaribbean.com/cruise-ships/utopia-of-the-seas",
    note: "A lively short getaway with plenty to do onboard.",
    featured: true,
  },
  {
    cruiseLine: "Royal Caribbean",
    ship: "Utopia of the Seas",
    dates: "March 26–29, 2027",
    nights: "3 nights",
    departure: "Port Canaveral, Florida",
    itinerary: "Bahamas · Perfect Day at CocoCay",
    perPerson: "$742.34",
    coupleTotal: "$1,484.68",
    bookingHref: "https://bookings.cbagenttools.com/swift/cruise/package/UT03PCN-2793044300?siid=1049337&lang=1",
    bookingLabel: "View this sailing",
    shipHref: "https://www.royalcaribbean.com/cruise-ships/utopia-of-the-seas",
  },
  {
    cruiseLine: "Royal Caribbean",
    ship: "Harmony of the Seas",
    dates: "March 20–27, 2027",
    nights: "7 nights",
    departure: "Port Canaveral, Florida",
    itinerary: "St. Kitts · San Juan · Perfect Day at CocoCay",
    perPerson: "$1,148.90",
    coupleTotal: "$2,297.80",
    bookingHref: "https://bookings.cbagenttools.com/swift/cruise/package/1575837--7-night-eastern-caribbean---perfect-day?siid=1049337&lang=1",
    bookingLabel: "View this sailing",
    shipHref: "https://www.royalcaribbean.com/cruise-ships/harmony-of-the-seas",
    note: "The weeklong Port Canaveral option if you want more time at sea and in port.",
    featured: true,
  },
  {
    cruiseLine: "Norwegian Cruise Line",
    ship: "Pride of America",
    dates: "March 20–27, 2027",
    nights: "7 nights",
    departure: "Honolulu, Hawaii",
    itinerary: "Maui · Hilo · Kona · Kauaʻi",
    perPerson: "$2,957",
    coupleTotal: "$5,914",
    bookingHref: "https://bookings.cbagenttools.com/swift/cruise?siid=1049337&lang=1&startdate=03%2F20%2F2027&enddate=03%2F27%2F2027&departureports=HNL&durations=7-9",
    bookingLabel: "Open matched CBAT search",
    shipHref: "https://www.ncl.com/cruise-ships/pride-of-america",
    note: "Hawaii sailing: flights and any pre-cruise hotel stay are separate. The CBAT link opens the matching date and Honolulu departure search.",
    featured: true,
  },
  {
    cruiseLine: "Carnival Cruise Line",
    ship: "Carnival Glory",
    dates: "February 26–March 1, 2027",
    nights: "3 nights",
    departure: "Port Canaveral, Florida",
    itinerary: "Bahamas · Celebration Key",
    perPerson: "$469",
    coupleTotal: "$938",
    bookingHref: "https://bookings.cbagenttools.com/swift/cruise/package/1552208--3-day-bahamas?siid=1049337&lang=1",
    bookingLabel: "View this sailing",
    shipHref: "https://www.carnival.com/cruise-ships/carnival-glory",
    note: "A familiar-line price comparison; the official ship page includes the Punchliner Comedy Club details.",
  },
  {
    cruiseLine: "Carnival Cruise Line",
    ship: "Carnival Venezia",
    dates: "March 28–April 4, 2027",
    nights: "7 nights",
    departure: "Port Canaveral, Florida",
    itinerary: "Western Caribbean · Celebration Key · Cozumel",
    perPerson: "$950",
    coupleTotal: "$1,900",
    bookingHref: "https://bookings.cbagenttools.com/swift/cruise/package/1533794--7-day-western-caribbean?siid=1049337&lang=1",
    bookingLabel: "View this sailing",
    shipHref: "https://www.carnival.com/en/Cruise-Ships/carnival-venezia",
    note: "The longer Carnival comparison, with an Italian-inspired ship design and dining venues.",
  },
];

function OfferCard({ offer }: { offer: CruiseOffer }) {
  return (
    <article className={`flex h-full flex-col rounded-sm border bg-white p-6 shadow-[0_8px_30px_rgba(20,35,40,0.04)] ${offer.featured ? "border-[#af7a50]/55" : "border-[#dce3e1]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#65736f]">{offer.cruiseLine}</p>
          <h2 className="mt-2 font-serif text-2xl leading-tight text-[#18323a]">{offer.ship}</h2>
        </div>
        <span className="shrink-0 border border-[#e4e9e6] px-2.5 py-1 text-xs font-medium text-[#52645f]">{offer.nights}</span>
      </div>

      <div className="mt-5 space-y-3 border-t border-[#edf0ee] pt-4 text-sm text-[#40534f]">
        <p className="flex gap-3"><CalendarDays size={17} className="mt-0.5 shrink-0 text-[#a96f42]" aria-hidden="true" /><span>{offer.dates}</span></p>
        <p className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-[#a96f42]" aria-hidden="true" /><span>{offer.departure}</span></p>
        <p className="flex gap-3"><Ship size={17} className="mt-0.5 shrink-0 text-[#a96f42]" aria-hidden="true" /><span>{offer.itinerary}</span></p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-[#edf0ee] py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#697873]">Balcony · each</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#18323a]">{offer.perPerson}</p>
          <p className="text-xs text-[#697873]">per person</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-[#697873]">For two guests</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#18323a]">{offer.coupleTotal}</p>
          <p className="text-xs text-[#697873]">total fare shown</p>
        </div>
      </div>

      {offer.note ? <p className="mt-4 text-sm leading-6 text-[#596a65]">{offer.note}</p> : <div className="mt-4" />}

      <div className="mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
        <a href={offer.bookingHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[#173640] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#244d58]">
          {offer.bookingLabel}<ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <a href={offer.shipHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-[#cbd6d2] px-4 py-3 text-center text-sm font-semibold text-[#24433f] transition-colors hover:bg-[#f5f7f5]">
          Explore the ship<ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export default function BrandonSpringCruiseOptionsPage() {
  return (
    <div className="min-h-screen bg-[#f6f7f4] text-[#18323a]">
      <header className="border-b border-white/10 bg-[#173640] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="relative h-14 w-40 rounded bg-white px-2 py-1">
            <Image src={logo} alt="Leisure Life Vacations" fill sizes="160px" className="object-contain p-2" priority />
          </div>
          <p className="text-right text-xs font-medium uppercase tracking-[0.16em] text-white/75">A personal cruise shortlist</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <section className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a96f42]">Prepared for Brandon · Spring 2027</p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-tight text-[#173640] sm:text-6xl">A balcony, a little sunshine, and a ship worth exploring.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#52645f] sm:text-lg">A few ways to spend a spring week or long weekend, with Port Canaveral first and a Hawaii option if you’re open to flying west.</p>
          <p className="mt-4 text-sm leading-6 text-[#65736f]">Each card has two separate links: one for the CB Agent Tools sailing or search, and one to explore the cruise line’s ship details, deck plans, rooms, dining, and activities.</p>
        </section>

        <section aria-label="Cruise options" className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer, index) => <OfferCard key={`${offer.ship}-${index}`} offer={offer} />)}
        </section>

        <aside className="mt-8 border-l-2 border-[#af7a50] bg-white/70 px-5 py-4 text-sm leading-6 text-[#52645f]">
          <p><strong className="font-semibold text-[#18323a]">Fare note:</strong> Balcony fares shown were captured October 24, 2026, in USD for two guests sharing one stateroom. The per-person and two-guest amounts include taxes and fees. Cruise prices and availability can change until booked.</p>
          <p className="mt-2">The Hawaii cruise departs from Honolulu, so airfare and any hotel stay are additional. Its CBAT link opens the matching sailing search for March 20–27, 2027.</p>
        </aside>

        <p className="mt-8 text-center text-sm text-[#6a7974]">Want to compare a different week, cabin, or port? I can check it for you.</p>
      </main>
    </div>
  );
}

