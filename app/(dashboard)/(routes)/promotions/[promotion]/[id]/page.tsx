import { useSearchParams } from 'next/navigation'
import React from 'react'
import { getCBSpecial } from './index.js'
import Image from 'next/image.js'
import { shipLogos } from '@/app/utils/shiplogos.ts'
import { Container1Header } from '@/components/containers/container1'

export default async function Promotion({ params: { promotion, id } }: any) {
  
  //const promotion = searchParams.get('promotion')
  console.log(promotion)
  console.log(id)
  const data:any = await getCBSpecial(`/${promotion}/${id}`);
  console.log(data)
  return (
    <div className='mx-6'>
      <div className='flex flex-wrap items-center justify-center'>
        <Image
        alt='logo'
        width={200}
        height={200}
        src={shipLogos(data.header)}
        />
        {/* <h2
        className='text-center text-2xl font-bold my-6 text-primary shadow-sm uppercase mx-6'
        >{data.header}</h2> */}
        <Container1Header headerText={data.header}/>
      </div>
      <div className='flex flex-row flex-wrap gap-2 justify-center items-center'>
        {data.info.map((message: any, index: number) => {
          return (
            <div
              className=" p-2 my-2 text-center rounded-md shadow-md bg-primary text-primary-foreground "
              key={index}
            >
              <p>{message}</p>
            </div>
          );
        })}
      </div>
    </div>
  )
}
