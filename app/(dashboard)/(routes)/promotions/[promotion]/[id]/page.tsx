import React from 'react'
import { getCBSpecial } from './index.js'
import Image from 'next/image.js'
import { shipLogos } from '@/app/utils/shiplogos.ts'
import { Container1Header } from '@/components/containers/container1'
import { CleanText } from '@/app/utils/CleanText.js'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function Promotion({ params }: { params: Promise<{ promotion: string, id: string }> }) {
  const { promotion, id } = await params;
  
  //const promotion = searchParams.get('promotion')
  console.log(promotion)
  console.log(id)
  const data:any = await getCBSpecial(promotion, id);
  console.log(data)
  const cleanedHeader = CleanText(String(data.header ?? ""));
  const cleanedHeadline = CleanText(String(data.headline ?? ""));
  const cleanedVendor = CleanText(String(data.vendor ?? ""));
  const cleanedCta = CleanText(String(data.cta ?? ""));
  const infoItems = Array.isArray(data.info) ? data.info : [];
  return (
    <div className='max-w-6xl px-6 pb-10 mx-auto space-y-6'>
      <div className='grid gap-6 md:grid-cols-2'>
        <Card className='p-6'>
          <div className='flex items-center gap-4'>
            <div className='p-3 bg-white border rounded-md shadow-sm'>
              <Image
                alt='logo'
                width={160}
                height={160}
                src={shipLogos(data.header)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Badge variant='secondary'>Special Offer</Badge>
              {cleanedVendor && (
                <Badge variant='outline'>{cleanedVendor}</Badge>
              )}
            </div>
          </div>
          <div className='mt-4 space-y-2'>
            <Container1Header headerText={cleanedHeader} />
            {cleanedHeadline && (
              <p className='text-sm text-muted-foreground'>{cleanedHeadline}</p>
            )}
          </div>
        </Card>
        <Card className='p-6'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <p className='text-xs tracking-wide uppercase text-muted-foreground'>Highlights</p>
              <p className='text-2xl font-semibold text-foreground'>{infoItems.length}</p>
            </div>
            <Badge variant='premium'>Limited Time</Badge>
          </div>
          {cleanedCta && (
            <CardContent className='p-4 mt-4 text-sm border rounded-md bg-muted/40 text-foreground'>
              {cleanedCta}
            </CardContent>
          )}
          <p className='mt-4 text-sm text-muted-foreground'>
            Offers are updated regularly. Reach out to our team to lock in availability.
          </p>
        </Card>
      </div>
      <div className='grid gap-4 md:grid-cols-2'>
        {infoItems.map((message: string, index: number) => {
          console.log(message)
          const cleanedMessage = CleanText(String(message ?? ""));
          return (
            <Card className='p-4' key={`${message}-${index}`}>
              {cleanedMessage && <p className='text-sm text-foreground'>{cleanedMessage}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  )
}
