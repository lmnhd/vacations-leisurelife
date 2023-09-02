import React from 'react'
import { Skeleton } from '../ui/skeleton'

export default function SearchResultsSkeleton() {
    console.log('search results skeleton')
  return (
    <div className="flex flex-col items-center ">
        
         {/* <Skeleton
        className="py-6 text-2xl font-bold text-center font-body text-primary"

        /> */}
        <div className="items-center h-auto ">
        <div className='p-0 opacity-0'>-----------------------------------------------------------------------------------------------</div>
        <h1 className='text-lg text-center bg-gray-100 shadow-sm '>Gathering Info...</h1>
            {[1,2,3,4,5].map((result: any, i: number) => {
                const color = i % 2 === 0 ? 'bg-yellow-200' : 'bg-blue-200'
                return <>
                <div className='flex items-center gap-4 px-6 my-4 bg-blue-300 rounded-lg'>
                    <Skeleton className={`w-28 h-24 shadow-sm rounded-3xl ${color}`}
                    />
                    
                    <div className='w-full p-2 my-2 rounded-sm'>
                    
                        <Skeleton  className='h-16 p-3 my-1 rounded-sm shadow-sm bg-primary'/>
                        <Skeleton 
                        className={`w-5/6 h-16 p-3 mx-auto my-1 rounded-sm shadow-lg ${color}`}
                        />
                    </div>
                </div>
                </>
            })}
        </div>
    </div>
  )
}
