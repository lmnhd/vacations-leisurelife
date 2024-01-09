"use client";
import React, {createContext, useState} from 'react'
import { Feed } from './[line]/page';

export const  NewsContext = createContext("" as any)

export const NewsProvider = ({children}: {children:React.ReactNode})  => {
    const [news, setNews] = useState<Feed>({lineTitle: "", articles: []})
    return (
        <NewsContext.Provider value={{news, setNews}}>
            {children}
        </NewsContext.Provider>
    )
}


