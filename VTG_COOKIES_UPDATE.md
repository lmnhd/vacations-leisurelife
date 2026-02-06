# VTG Cookies Update Guide

## Issue
The VTG search is returning no results because the cookies in `app/api/vtgSearch/cookies.json` are expired (from September 2022).

## Root Cause
- **Not** caused by the Prisma upgrade
- The cookies stored in `cookies.json` expired in 2022
- VTG website requires valid session cookies to return deal data
- When cookies are invalid/expired, the website returns HTML with no `.deals` elements, so the parser returns an empty string

## Solution: Update Cookies

You'll need to obtain fresh cookies from the VTG website:

### Option 1: Using Browser DevTools
1. Go to https://www.vacationstogo.com in your browser
2. Open DevTools (F12 → Application/Storage tab)
3. Under Cookies, find cookies for `.vacationstogo.com`
4. Copy the cookie name and value pairs
5. Replace the contents of `cookies.json` with the new cookie data

### Option 2: Using a Browser Extension
- Install "EditThisCookie" or similar extension
- Navigate to VTG website
- Export cookies and format them into the JSON structure

### Cookie JSON Format
The `cookies.json` should contain an array of cookie objects:
```json
[
  {
    "name": "cookie_name",
    "value": "cookie_value",
    "domain": ".vacationstogo.com",
    "path": "/",
    "expires": 1234567890,
    "size": 50,
    "httpOnly": false,
    "secure": false,
    "session": false
  }
]
```

### Important Notes
- Make sure the 5th cookie (index 4) is a valid session cookie (the code uses `cookies[4]`)
- Cookie expiration times are in Unix timestamps
- HTTPS-only cookies should have `"secure": true`

## Testing
After updating `cookies.json`:
1. Restart the dev server (`npm run dev`)
2. Try a VTG search
3. Check browser console for the search results

## If Still Not Working
- VTG website structure may have changed (CSS selectors might not match)
- Check if selectors like `.deals` and `.vtg-layout-main` still exist on the page
- The website may be blocking automated requests - consider adding user-agent headers
