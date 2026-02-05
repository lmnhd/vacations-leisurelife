import { cbPick, cbPicks, pickID } from "@/app/(dashboard)/(routes)/destinationdeal/[id]/index.js";
import { aiAssistBackOff } from "@/app/utils/api";
import { CleanText } from "@/app/utils/CleanText.js";
import { CBPickData } from "@/components/cb/cbdestinationpickstile";

export interface gptTask {
  task: string;
  instruction: string;
}

export const gptTasks: gptTask[] = [
  {
    task: "title",
    instruction: "write a creative title for this trip in one sentence",
  },
  {
    task: "subtitle",
    instruction:
      "write a subtitle for this deal. form your response as answer only",
  },
  {
    task: "mainImage",
    instruction:
      "In 3 to 6 words (the name of ship is considered 1 word), what is the name of the ship in this deal? Only use the name of cruise line and name of ship. (example: Royal Caribbean Symphony Of The Seas) ",
  },
  {
    task: "mainImageAlt",
    instruction: "write the alt text for the main image in 6 words or less",
  },
  {
    task: "bodyText",
    instruction:
      "write the body of an article about this deal using around 200 words. form your response as answer only without initial explanation.",
  },
  {
    task: "featuresText",
    instruction:
      "Locate and list any special highlights that are exclusive to this deal if they are mentioned in the text. This can be special pricing, drink and/or dining specials, bonuses, and onboard credits. If no exclusive offers are mentioned just write a dash only. ",
  },
  {
    task: "itinerary",
    instruction:
      "list the ports of call if possible and the days of the week they are visited if possible. form your response as answer only and dont mention it if some info is not there",
  },
  {
    task: "price",
    instruction:
      "using one word and numbers/symbols only, write the price of the deal, per-person, in dollars. (example: $1,234)",
  },
  {
    task: "tripLength",
    instruction:
      "In 2 words, write the length of this trip. (example: 7 nights)",
  },
];

export async function generateDealContent(id: string): Promise<{ data: Record<string, string>, pick: CBPickData } | null> {
  const decodedURI = decodeURIComponent(
    id.replaceAll("%C3%82%C2%A0", "%C2%A0").replaceAll("%C4%80%C2%A0", "%C2%A0")
  );
  
  let pick = (await cbPick(decodedURI)) as CBPickData | null;

  if (!pick) {
    const picks = (await cbPicks()) as CBPickData[];
    const normalizedTarget = decodedURI.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
    pick =
      picks.find((candidate: CBPickData) => {
        const legacyId = pickID(candidate)
          .replaceAll(/[^a-zA-Z0-9]/g, "")
          .toLowerCase();
        return legacyId === normalizedTarget;
      }) || null;
  }

  if (!pick) {
    return null;
  }

  const result: Record<string, string> = {};
  const dataText = JSON.stringify(pick);
  
  for (let task of gptTasks) {
    const response = await aiAssistBackOff(
      task.instruction,
      CleanText(dataText),
      "destinationdeal" + pick.id,
      task.task,
      "", 
      false
    );
    result[task.task] = response || "";
  }

  return { data: result, pick: pick };
}
