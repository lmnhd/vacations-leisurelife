import React from 'react'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "@/components/ui/popover";
import { depositAmount, formatPrice } from '@/lib/utils';
import Link from 'next/link';

export default function AboutPaymentsPopup() {
  return (
    <Popover>
    <PopoverTrigger className="w-full p-3 mx-auto text-3xl font-bold text-center text-white rounded-sm bg-violet-500">
      About Payments...
    </PopoverTrigger>
    <PopoverContent className="mx-auto bg-slate-900 space-y-7 md:w-2/3 ">
      <p className="text-xs text-white ">
        Prices based on double occupancy only.<br/> Single passenger
        will still pay for 2 occupants
        <br/>
        <span className="ml-4 text-yellow-500">* 2nd occupant may be added later... Just contact us to make the change.</span>
      </p>
      {/* <p className="text-xs text-white ">
        Prices subject to change at MSC&apos;s discretion
      </p> */}
      <p className="text-xs text-white ">
        You will be required to pay a minimum deposit of {formatPrice(depositAmount)} per cabin,
        which will be charged within 24 hours.<br/> You can alternatively
        choose to pay the entire amount of your cabin.
      </p>
      <p className="text-xs text-white ">
        Taxes and fees ($75.00 per person) will also be charged
        now if you choose to pay the entire amount of your cabin.
      </p>
      {/* <p className="text-xs text-white">
        When you click the &apos;Book and Pay Now&apos; button,
        you will be taken to a secure payment page to complete
        your transaction.
      </p> */}
      <p className="text-xs text-white">
        After booking you will receive information on how to
        submit your travel documents. i.e. passport, birth
        certificate, etc.
      </p>
      <p className="text-xs text-white">
        Refunds are subject to MSC&apos;s terms and conditions.
        Please review the terms and conditions before booking.{" "}
        <Link
          className="text-blue-500 underline"
          href="/Terms & Conditions.pdf"
        >
          terms and conditions
        </Link>
      </p>
    </PopoverContent>
  </Popover>
  )
}
