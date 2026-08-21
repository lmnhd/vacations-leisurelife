'use client';

import { useState } from 'react';
import { Monitor, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function VoiceEntryDialog({ telephoneNumber }: { telephoneNumber: string }) {
  const [open, setOpen] = useState(true);
  const displayNumber = formatUsPhoneNumber(telephoneNumber);
  const dialableNumber = stripToDialable(telephoneNumber);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="medium"
        className="max-h-[calc(100vh-2rem)] overflow-y-auto border-[#633C82] bg-[#1A0B2E] p-5 text-[#FFF4E8] shadow-lg sm:p-7"
      >
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="text-2xl font-black tracking-tight sm:text-3xl">
            Choose how you&apos;d like to talk
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-xl text-sm leading-6 text-[#DCC6EA]">
            Call the Leisure Life cruise concierge from your phone, or continue with the
            browser voice demo on this page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Card className="flex flex-col justify-between rounded-lg border-[#759B35] bg-[#2D0F4C] p-5 text-[#FFF4E8] shadow-none">
            <div>
              <Phone aria-hidden className="h-5 w-5 text-[#B4FF39]" />
              <h2 className="mt-4 text-base font-bold">Call from your phone</h2>
              <a
                href={`tel:${dialableNumber}`}
                onClick={() => setOpen(false)}
                className="mt-2 block text-2xl font-black tracking-tight text-[#B4FF39] underline decoration-[#759B35] underline-offset-4"
              >
                {displayNumber}
              </a>
              <p className="mt-3 text-sm leading-6 text-[#DCC6EA]">
                Dial this number to speak with the automated service agent over a normal phone
                call.
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="mt-5 w-full rounded-md bg-[#B4FF39] font-bold text-[#1A0B2E] hover:bg-[#C7FF6B]"
            >
              <a href={`tel:${dialableNumber}`} onClick={() => setOpen(false)}>
                Call {displayNumber}
              </a>
            </Button>
          </Card>

          <Card className="flex flex-col justify-between rounded-lg border-[#287B88] bg-[#2D0F4C] p-5 text-[#FFF4E8] shadow-none">
            <div>
              <Monitor aria-hidden className="h-5 w-5 text-[#22E4FF]" />
              <h2 className="mt-4 text-base font-bold">Continue in your browser</h2>
              <p className="mt-3 text-sm leading-6 text-[#DCC6EA]">
                Stay here to use your browser microphone. You can also switch to typing at any
                time.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-md border-[#22E4FF] bg-transparent font-bold text-[#22E4FF] hover:bg-[#22E4FF] hover:text-[#1A0B2E]"
            >
              Continue to the demo
            </Button>
          </Card>
        </div>

        <p className="text-xs leading-5 text-[#B79BCB]">
          Both options connect to the same AI-powered demonstration. Standard phone rates may
          apply.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function stripToDialable(value: string): string {
  let dialable = '';
  for (const character of value) {
    if (character === '+' && dialable.length === 0) {
      dialable += character;
      continue;
    }
    if (character >= '0' && character <= '9') dialable += character;
  }
  return dialable;
}

function formatUsPhoneNumber(value: string): string {
  const digits = stripToDialable(value).split('').filter((character) => character !== '+');
  const nationalDigits = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (nationalDigits.length !== 10) return value;
  return `(${nationalDigits.slice(0, 3).join('')}) ${nationalDigits
    .slice(3, 6)
    .join('')}-${nationalDigits.slice(6).join('')}`;
}
