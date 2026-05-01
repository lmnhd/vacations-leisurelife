"use client";

import Script from "next/script";

export const CrispChat = () => {
    return (
        <>
            <Script id="crisp-init" strategy="afterInteractive">
                {`
                    window.$crisp = [];
                    window.CRISP_WEBSITE_ID = "277142bc-9a54-4dec-ba13-e7280a077a31";
                `}
            </Script>
            <Script
                src="https://client.crisp.chat/l.js"
                strategy="afterInteractive"
            />
        </>
    );
}