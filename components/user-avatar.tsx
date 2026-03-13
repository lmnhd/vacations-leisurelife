"use client";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

export const UserAvatar = () => {
    return (
        <Avatar className="w-8 h-8">
            <AvatarImage src="" />
            <AvatarFallback>U</AvatarFallback>
        </Avatar>
    )
}