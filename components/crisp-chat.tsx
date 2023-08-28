"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web"

export const CrispChat = () => {

    useEffect(() => {
        Crisp.configure("277142bc-9a54-4dec-ba13-e7280a077a31")
    }, []);

    return null;
}