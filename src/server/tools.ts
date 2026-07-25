import type Anthropic from "@anthropic-ai/sdk";

export const forgeTools: Anthropic.Tool[] = [
  {
    name: "generate_vehicle_asset",
    description:
      "Start a 3D vehicle generation job when the user asks to create or update a vehicle model. " +
      "Synthesize the prompt fields from the ENTIRE conversation so far, not just the latest message — " +
      "fold in every design detail the user has given across earlier turns (materials, proportions, lighting, stance, etc.).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Shape/form description for the 3D generator, max 600 characters. Describe ONE object only " +
            "(the vehicle) — never a scene, background, or camera framing. Include vehicle class and body " +
            "style, proportions and stance, and distinguishing silhouette details (roofline, greenhouse, " +
            "wheel arches, front/rear fascia). Do not describe color, material, or texture here — that " +
            "belongs in texturePrompt."
        },
        texturePrompt: {
          type: "string",
          description:
            "Material/finish description for the PBR texturing pass, max 600 characters. Covers paint " +
            "color and finish (gloss, matte, metallic, pearlescent), trim materials (chrome, carbon fiber, " +
            "matte black), glass tint, and any lighting accent colors mentioned in the conversation (e.g. " +
            "amber signature lighting). Omit if the user gave no material detail."
        },
        targetFormat: { type: "string", enum: ["glb"], description: "Initial interchange format." }
      },
      required: ["prompt", "targetFormat"],
      additionalProperties: false
    }
  }
];
