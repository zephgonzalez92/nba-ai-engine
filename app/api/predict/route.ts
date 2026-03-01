
import { logisticProbability } from "@/lib/model";
import { blendedProbability } from "@/lib/blend";

export async function POST(req: Request) {
  const body = await req.json();

  const features = body.features;
  const marketProb = body.marketProb;
  const eloProb = body.eloProb;

  const modelProb = logisticProbability(features);
  const finalProb = blendedProbability(modelProb, eloProb, marketProb);

  return Response.json({
    modelProb,
    finalProb
  });
}
