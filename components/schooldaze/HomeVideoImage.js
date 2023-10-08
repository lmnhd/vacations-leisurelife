"use client";
import { cn } from "@/lib/utils";
import style from "./HomeVideoImage.module.css";
//import logoStyle from "./logostyle.module.css"

//import logo from "./logo.svg";
//import webText from "./web text.svg";
//import NewsWidget from "../News/NewsWidget";
import { useEffect, useRef, useState } from "react";
import { useLayoutEffect } from "react";
//import Hero from "./Hero";
//const videoLink = "../../public/video/0727.mp4";
export default function HomeVideoImage({content}) {
  var wrapper = document.querySelector("object");
  const newsWrapperRef = useRef(null);
  const videoRef = useRef(null);

  const [imageSizeWatch, setImageSizeWatch] = useState({
    width: 400,
    height: 400,
  });
  //const [wrapperSize, setWrapperSize] = useState({width : 400, height : 400})

  useEffect(() => {
    //setImageSizeWatch({width : videoRef?.current?.clientWidth, height : videoRef?.current?.clientHeight});
    console.log(imageSizeWatch);
    let interval = setInterval(() => {
      newsWrapperRef.current.style.height = `${videoRef?.current?.clientHeight}px`;
      newsWrapperRef.current.style.width = `${videoRef?.current?.clientWidth}px`;
      clearInterval(interval);
    }, 1000);
  }, [newsWrapperRef.current, videoRef.current]);

  function test() {}
  function animate() {
    console.log(wrapper);
    wrapper.classList.add("active");
  }

  return (
    <>
      <div ref={videoRef} className={cn('hidden md:block',style.vidCon)}>
       
        <div
          
          className={style.overlay3}
          
        >
          <div 
          className="flex items-start justify-start w-full "
          ref={newsWrapperRef}
          //className="flex-col hidden md:flex md:flex-col-reverse "
          >
            {content}
            {/* <p className="text-3xl font-semibold">
              Your First Stop On A Fantastic Voyage!
            </p>
            <p>Welcome to Leisure Life</p> */}

            {/* <p
          className="text-3xl font-bold font-body"
          >Your adventure starts here!</p>
           <h2
           className="text-blue-500 shadow-md"
           >Let us make it happen.</h2>
           <h3
           className="mt-20 font-sans text-gray-800"
           >Join Our Group</h3> */}
          </div>
          {/* <div className="md:hidden"><Hero/></div> */}
        </div>

        <div>
        <video
        className={cn('bg-black bg-blend-color-dodge opacity-50', style.videobg)}
          src="https://www.dropbox.com/scl/fi/5xrnmz52tdtngxf5nvgw3/daze_bg.mp4?rlkey=bo7nfmi2hlcg3rc8gmhtap29i&dl=0"
          controls={false}
          autoPlay
          muted
          loop
        />

          {/* <video
            className={style.videobg}
            src="https://youtu.be/VjWykYKxbvE?si=mo3nU6YQFaM_rzB5" 
            autoPlay
            muted
            loop
          ></video> */}
        </div>
      </div>
    </>
  );
}
