export async function sendAdminPushNotification(message, options = {}) {
    const token = process.env.PUSHOVER_API_TOKEN
    const user = process.env.PUSHOVER_RECIPIENT_KEY

    if (!token || !user) {
        throw new Error('Pushover credentials are not configured. Set PUSHOVER_API_TOKEN and PUSHOVER_RECIPIENT_KEY.')
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('Pushover message is required.')
    }

    const body = new URLSearchParams({
        token,
        user,
        priority: options.priority ?? '1',
        title: options.title ?? 'Leisure Life Admin Notification',
        message: message.trim(),
    })

    if (options.sound) body.set('sound', options.sound)
    if (options.url) body.set('url', options.url)
    if (options.urlTitle) body.set('url_title', options.urlTitle)
    if (options.priority === '2') {
        body.set('retry', options.retry ?? '30')
        body.set('expire', options.expire ?? '300')
    }

    const response = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Pushover request failed (${response.status}): ${text}`)
    }

    return response.json()
}
