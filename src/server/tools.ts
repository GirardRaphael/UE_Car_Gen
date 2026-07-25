import type Anthropic from "@anthropic-ai/sdk";

export const forgeTools: Anthropic.Tool[] = [
  {
    name: "generate_vehicle_asset",
    description: "Start a 3D vehicle generation job when the user asks to create a new vehicle model.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed production prompt for the 3D provider." },
        targetFormat: { type: "string", enum: ["glb"], description: "Initial interchange format." }
      },
      required: ["prompt", "targetFormat"],
      additionalProperties: false
    }
  }
];
