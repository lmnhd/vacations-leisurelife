import Stepper from '@/components/forms/input/stepper'
import PreRegisterForm from '@/components/forms/preRegisterForm'
import PreRegisterForm2 from '@/components/forms/preRegisterForm2'
import { LandingNavbar } from '@/components/landing-navbar'
import Schooldazefooter from '@/components/schooldaze/schooldazefooter'
import Schooldazehero from '@/components/schooldaze/schooldazehero'
import { Schooldazenavbar } from '@/components/schooldaze/schooldazenavbar'
import { School } from 'lucide-react'
import React from 'react'

// #GenX 
// #GenerationX 
// #HipHop
// #90’s 
// #Late-80’s
// #HBCU 
// #Throwback
// "Black College Alumni Weekend at Sea....
// Join us for a SCHOOL-DAZE ...THROWBACK COLLEGE EXPERIENCE
// with enrichment, performances & school pride events!

export default function SchoolDazeLanding() {
  return (
    <div className=''>
      <Schooldazenavbar/>
      <Schooldazehero/>
        <PreRegisterForm2/>
        <Schooldazefooter/>
    </div>
  )
}
