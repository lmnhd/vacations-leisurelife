import axios from "axios";
//import Pushover from 'node-pushover'

export async function sendAdminPushNotification(message){
    console.log('sending push notification', message)
    const url = 'https://api.pushover.net/1/messages.json'
    // const push = new Pushover({
    //     token: process.env.NEXT_PUBLIC_PUSHOVER_API_KEY,
    //     user: process.env.NEXT_PUBLIC_PUSHOVER_USER_GROUP_KEY
    // })
    // push.send(message)
    const data = {
        token: process.env.NEXT_PUBLIC_PUSHOVER_API_KEY,
        user: process.env.NEXT_PUBLIC_PUSHOVER_USER_GROUP_KEY,
        priority:2,
        sound:'gamlan',
        title:'Leisure Life Admin Notification',
        message: message,
        expire:30,
        retry:30,

        
    }
    console.log(data)
    try {
       await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
    } catch (error) {
        console.log(error)
    }
    
}