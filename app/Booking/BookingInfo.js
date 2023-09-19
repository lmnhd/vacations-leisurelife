export const location = {
  fields: [
    { name: "country", val: "", type: "string", label: "Country" },
    { name: "state", val: "", type: "string", label: "State" },
    { name: "city", val: "", type: "string", label: "City" },
    { name: "id", val: "", type: "string", label: "City" },
    { name: "description", val: "", type: "string", label: "Description" },
    { name: "zip", val: "", type: "string", label: "Zip Code" },
  ],
  type: "string",
  label: "Location",
};
export const transportationMode = {
  fields: [
    { name: "cruiseOnly", val: true, type: "bool", label: "Cruise Only" },
    { name: "air", val: false, type: "bool", label: "Air" },
    { name: "shuttle", val: false, type: "bool", label: "Shuttle" },
    { name: "rideShare", val: false, type: "bool", label: "Ride Share" },
    { name: "taxi", val: false, type: "bool", label: "Taxi" },
    { name: "train", val: false, type: "bool", label: "Train" },
    { name: "bus", val: false, type: "bool", label: "Bus" },
  ],
  type: "multiselect-bool",
  label: "Transportation Mode",
};
export const port = {
  fields: [
    { name: "name", val: "", type: "string", label: "Port Name" },
    { name: "location", val: location, type: "entity-location", label: "Port Location" },
    { name: "id", val: "", type: "string", label: "Port ID" },
    {
      name: "description",
      val: "",
      type: "string",
      label: "Port Description",
    },
  ],
  type: "string",
  label: "Port",
};

export const cabinType = {
  fields: [
    { name: "inside", val: 0, type: "number", label: "Inside" },
    { name: "oceanView", val: 1, type: "number", label: "OceanView" },
    { name: "balcony", val: 2, type: "number", label: "Balcony" },
    { name: "suite", val: 3, type: "number", label: "Suite" },
    { name: "other", val: [], type: "other", label: "Other Type" },
  ],
  type: "select-number",
  label: "Cabin Type",
};
export const extras = {
  fields: [
    { name: "wifi", val: false, type: "bool", label: "Wifi" },
    { name: "drinkPackage", val: false, type: "bool", label: "Drink Package" },
    { name: "obc", val: false, type: "bool", label: "On Board Credits" },
    { name: "other", val: [], type: "other", label: "Other Extras" },
  ],
  type: "multiselect-bool",
  label: "Extras",
};
export const specialNeeds = {
  fields: [
    {
      name: "wheelChair",
      val: false,
      type: "bool",
      label: "Wheel Chair",
    },
    {
      name: "hearingImpaired",
      val: false,
      type: "bool",
      label: "Hearing Impaired",
    },
    {
      name: "visionImpaired",
      val: false,
      type: "bool",
      label: "Vision Impaired",
    },
    { name: "other", val: [], type: "other", label: " Other Special Needs" },
  ],

  type: "multiselect-bool",
  label: "Special Needs",
};
export const other = { fields: [{ name: "" }], type: "string", label: "Other" };
export const qualifiers = {
  fields: [
    { name: "military", val: false, type: "bool", label: "Military" },
    { name: "police", val: false, type: "bool", label: "Police" },
    { name: "fireDept", val: false, type: "bool", label: " Fire Department" },
    { name: "doctor", val: false, type: "bool", label: "Doctor" },
  ],
  type: "multiselect-bool",
  label: "Qualifiers",
};
export const vipNum = {
  fields: [
    { name: "cruiseLine", val: "", type: "string", label: "Cruise Line" },
    { name: "id", val: "", type: "string", label: "ID" },
  ],
  type: "string",
  label: "VIP Number",
};
export const itineraryDay = {
  fields: [
    { name: "date", val: "", type: "string", label: "Date" },
    { name: "time", val: "", type: "string", label: "Time" },
    {
      name: "location",
      val: location,
      type: " string",
      label: "Location",
    },
  ],
  type: "string",
  label: "Itinerary Day",
};

export const cruiseLine = {
  fields: [
    { name: "id", val: "", type: "string", label: "ID" },
    { name: "name", val: "", type: "string", label: "Name" },
    { name: "home", val: location, type: "entity-location", label: "Home" },
  ],
  type: "string",
  label: "Cruise Line",
};

export const cruiseShip = {
  fields: [
    { name: "id", val: "", type: "string", label: "Ship ID" },
    { name: "ship", type: "string", label: "Name Of Ship" },
    { name: "line", val: cruiseLine, type: "entity-cruiseLine", label: "Cruise Line" },
  ],
  type: "string&entity",
  label: "Cruise Ship",
};

export const guestCategory = {
  fields: [
    { name: "infant", val: 0, type: "number", label: "Infant" },
    { name: "child", val: 1, type: "number", label: "Child" },
    { name: "teen", val: 2, type: "number", label: "Teen" },
    { name: "adult", val: 3, type: "number", label: "Adult" },
    { name: "senior", val: 4, type: "number", label: "Senior" },
  ],
  type: "select-number",
  label: "Guest Category",
};

export const guestGender = {
  fields: [
    { name: "male", val: 0, type: "number", label: "Male" },
    { name: "female", val: 1, type: "number", label: "Female" },
    { name: "other", val: 2, type: "number", label: "Other" },
  ],
  type: "select-number",
  label: "Guest Gender",
};

export const passenger = {
  fields: [
    { name: "firstName", val: "", type: "string", label: "First Name" },
    { name: "lastName", val: "", type: "string", label: "Last Name" },
    { name: "email", val: "", type: "string", label: "Email" },
    { name: "phone", val: "", type: "string", label: "Phone" },
    { name: "address", val: location, type: "entity-location", label: "Address" },
    { name: "age", val: "", type: " string", label: "Age" },
    {
      name: "specialNeeds",
      val: specialNeeds,
      type: "entity-specialNeeds",
      label: "Special Needs",
    },
    {
      name: "guestCategory",
      val: guestCategory,
      type: "entity-guestCategory",
      label: "Guest Category",
    },
    {
      name: "guestGender",
      val: guestGender,
      type: "entity-guestGender",
      label: "Guest Gender",
    },
    {
      transportationMode: transportationMode,
      type: "entity-transportationMode",
      label: "Transportation Mode",
    },
    { name: "cabinType", val: cabinType, type: "entity-cabinType", label: "Cabin Type" },
    {
      name: "qualifiers",
      val: qualifiers,
      type: "multiselect-bool",
      label: "Qualifiers",
    },
    { name: "cabinShare", val: [], type: "array-entity-passenger", label: "Cabin Share" },
  ],
  type: "string",
  label: "Passenger",
};

export  const BookingInfo = {
  tripInfo: [
    {
      fields: [
        { name: "ship", val: cruiseShip, type: "entity-ship", label: "Cruise Ship" },
      ],
      required: false,
      prePopulated: true,
    },

    {
      fields: [
        { name: "numNights", val: 0, type: "number", label: "Number of Nights" },
      ],
      required: false,
      prePopulated: true,
    },

    {
      fields: [
        {
          name: "passengers",
          val: [],
          type: "array-entity-passenger",
          label: "Passengers",
        },
      ],
      required: true,
      prePopulated: false,
    },
    {
      fields: [
        {
          name: "vPorts",
          val: [],
          type: "array-entity-port",
          label: "Visiting Ports",
        },
      ],
      required: false,
      prePopulated: true,
    },
    {
      fields: [
        {
          name: "rPort",
          val: port.name,
          type: "entity-port",
          label: "Returning Port",
        },
      ],
      required: false,
      prePopulated: true,
    },
    {
      fields: [
        {
          name: "dPort",
          val: port.name,
          type: "entity-port",
          label: "Destination Port",
        },
      ],
      required: false,
      prePopulated: true,
    },
    {
      fields: [
        { name: "group", val: false, type: "select-bool", label: "Group?" },
        { size: 0, type: "number", label: "Size" },
      ],
      required: false,
      prePopulated: false,
    },
    {
      fields: [
        {
          name: "promotion",
          val: false,
          type: "select-bool",
          label: "Promotion",
        },
      ],
      required: false,
      prePopulated: true,
    },
    {
      fields: [
        { name: "business", val: false, type: "select-bool", label: "Business?" },
      ],
    },
    {
      fields: [
        {
          name: "itinerary",
          val: [],
          type: "array-entity-itineraryDay",
          label: "Itinerary",
        },
      ],
      required: false,
      prePopulated: true,
    },
    {
      fields: [
        {
          name: "needHotel",
          val: false,
          type: "select-bool",
          label: "Pre/Post trip hotel?",
        },
      ],
      required: false,
      prePopulated: false,
    },
    {
      fields: [
        {
          name: "transportationMode",
          val: transportationMode.cruiseOnly,
          type: "entity-transportationMode",
          label: "Transportation Mode",
        },
      ],
      required: false,
      prePopulated: false,
    },
  ],
};
