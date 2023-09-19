export  function CleanText(text) {
  return text
    .replaceAll("CRUISEBROTHERS.COM", "LEISURELIFEVACATIONS.NET")
    .replaceAll("EMAIL SALES@", "EMAIL ADMIN@")
    .replaceAll("800-827-7779", process.env.REACT_APP_LLV_PHONE)
    .replaceAll("Cruise Brothers", "Leisure Life")
    .replaceAll("CRUISE BROTHERS", "LEISURE LIFE")
    .replaceAll("sales@cruisebrothers.com", "admin@leisurelifevacations.net")
    .replaceAll("800.827.7779",process.env.REACT_APP_LLV_PHONE)
    .replaceAll("Cruise Industry News", "We")
}
