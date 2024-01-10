import axios from "axios";
import prismadb from "@/lib/prismadb";
import { backOff } from "exponential-backoff";
import Configuration, { ClientOptions, OpenAI } from "openai";

const configuration: ClientOptions = {
  apiKey: process.env.OPENAI_API_KEY,
};
const openai = new OpenAI(configuration);
async function storeAIResponse(
  prompt: string,
  response: string,
  componentId: string,
  functionId: string
) {
  //console.log(prompt, response);
  const storedResponse = await prismadb.aIAssist.create({
    data: {
      prompt: prompt,
      response: response,
      ignore: false,
      componentId: componentId,
      functionId: functionId,
    },
  });
  return storedResponse;
}
async function checkForStoredAIResponse(
  prompt: string,
  componentId: string,
  functionId: string
) {
  const storedResponse = await prismadb.aIAssist.findMany({
    where: {
      componentId: componentId,
      functionId: functionId,
      prompt: prompt,

      ignore: false,
    },
  });
  return storedResponse;
}
async function deleteStoredData(tableValueName: string) {
  const storedResponse = await prismadb.aIAssist.deleteMany({
    where: {
      functionId: tableValueName,
    },
  });
  return storedResponse;
}
export async function getVTGShipData(params: any) {
  console.log(params);

  const response = await axios.post("/api/vtgTrip", {
    data: params,
  });
  // console.log(response.data);
  // return response.data;
}
export async function aiAssistBackOff(
  instructions: string,
  data: string,
  componentId: string,
  functionId: string,
  deleteData: string = ""
) {
  try {
    const response: string = await backOff(() =>
      aiAssist(instructions, data, componentId, functionId, deleteData)
    );
    return response;
  } catch (error) {
    console.error(error);
    //return error;
  }
}
async function aiAssist(
  instructions: string,
  data: string,
  componentId: string,
  functionId: string,
  deleteData: string = ""
) {
  if (deleteData == "") {
  } else {
    console.log("deleting stored data...", deleteData);
    await deleteStoredData(deleteData);
    //return 'deleted';
  }

  const message = `${instructions} : """${data}"""`;
  console.log(message);
  //return
  console.log("checking for stored response...");
  const storedResponse = await checkForStoredAIResponse(
    data,
    componentId,
    functionId
  );
  console.log("search for stored response complete... ", storedResponse)
  if (storedResponse.length > 0) {
    console.log("stored response found");
    console.log(storedResponse[0].response)
    return storedResponse[0].response;
  }else{
    console.log("no stored response found");
    //return "no response found";
  }
  if (process.env.NODE_ENV == "development") {
    console.log("no stored response found, querying openai...");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const userMessage: any = {
      role: "user",
      content: message,
    };
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [userMessage],
      max_tokens: 1000,
    });
    const res = response.choices[0].message.content || "error";
    console.log(res);

    if (res !== "error") {
      console.log("storing response...");
      storeAIResponse(data, res, componentId, functionId);
    }
    return res;
  }

  return "no response found";
  //console.log(response.choices[0].message.content)
}
