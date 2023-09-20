import { Countries } from "../utils/CommonObjects/Countries";
import { USStates } from "../utils/CommonObjects/USStates";

export class Passenger {
  paxType = null;
  title = null;
  gender = null;

  firstName = null;
  middleName = null;
  lastName = null;
  //address = new Address();

  age = null;
  phone1 = null;
  phone2 = null;

  email = null;

  vipNumber = null;
  fareCode = null;
  address = new Address();

  cabinType = null;

  titleFields = [
    { key: "mr", value: 0, text: "Mr" },
    { key: "mrs", value: 1, text: "Mrs" },
    { key: "ms", value: 2, text: "Ms" },
    { key: "master", value: 3, text: "Master" },
    { key: "miss", value: 4, text: "Miss" },
    { key: "dr", value: 4, text: "Doctor" },
  ];
  countries = Countries;
  states = USStates;
  cabinTypeFields = [
    { key: "inside", value: "inside", text: "Inside" },
    { key: "ocean", value: "oceanView", text: "Ocean View" },
    { key: "balcony", value: "balcony", text: "Balcony" },
    { key: "suite", value: "suite", text: "Suite" },
  ];
  paxTypeFields = [
    { key: "nothing", value: 0, text: "Nothing" },
    { key: "adult", value: 1, text: "Adult" },
    { key: "child", value: 2, text: "Child" },
  ];
  docInfo = new DocumentInfo();
  amenities = [];
  amenityChoices = ["Drink Package", "On Board Credits", "WiFi", "Trip Excursions","Dining Specials"];

  //cabinType = null;

  // transportationMode = [
  //     { key: 0, value: false, text: "Air" },
  //     { key: 1, value  : false, text: "Shuttle" },
  //     { key: 2, value  : false, text: "Ride Share" },
  //     { key: 3, value  : false, text: "Taxi" },
  //     { key: 4, value  : false, text: "Train" },
  //     { key: 5, value  : false, text: "Bus" },
  //     { key: 6, value  : false, text: "Other" },
  //   ];

  //   constructor(firstName = "",lastName = "") {
  //     this.firstName = firstName;
  //     this.lastName = lastName;
  //    }
}

// export enum Gender {
//   select,
//   male,
//   female,
//   other,
// }
class DocumentInfo {
  type = null;
  issueDate = null;
  expiryDate = null;
  issueCountry = null;
  typeFields = [
    { key: "state", value: 0, text: "State ID" },
    { key: "passport", value: 1, text: "Passport" },
    { key: "dl", value: 2, text: "Drivers License" },
  ];
}
export class CruiseLine {
  name = "";
  location = new Address();
  id = "";
}
export class CruiseShip {
  name = "";
  line = "";
  id = "";
}
export class Address {
  //   label = "" = "Address";

  address1 = null;
  address2 = null;
  country = "United States";
  state = null;
  city = null;
  zip = null;

  //   lat = "";
  //   lng = "";
  //   formattedAddress = () => {
  //     return `${this.street} ${this.number} ${this.city} ${this.state} ${this.zip}`;
  //   };
}
export class Port {
  name = "";
  location = new Address();
  id = "";
  description = "";
}
export class Extras {
  wifi = false;
  drinkPackage = false;
  obc = false;
  other = "";
}
export class TransportationMode {
  cruiseOnly = true;
  air = false;
  shuttle = false;
  rideShare = false;
  taxi = false;
  train = false;
  bus = false;
}

// export class CabinType {
//   Inside=0
//   OceanView=1
//   Outside=2
//   Balcony=3
//   Suite = 4
//   Other = 5

// }
// export enum CabinType {
//   Select,
//   Inside,
//   OceanView,
//   Balcony,
//   Suite,
//   Other,
// }
