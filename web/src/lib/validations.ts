import { z } from "zod"

export const factoryRegistrationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  industryType: z.string().min(2, "Industry type is required"),
  location: z.object({
    lat: z.number().min(-90).max(90, "Invalid latitude"),
    lng: z.number().min(-180).max(180, "Invalid longitude"),
    address: z.string().min(5, "Address is required"),
  }),
  productionCapacity: z.string().min(1, "Production capacity is required"),
  rawMaterials: z.array(z.string()).min(1, "At least one raw material is required"),
  declaredWastes: z.array(z.string()).min(1, "At least one waste stream is required"),
})

export type FactoryRegistrationInput = z.infer<typeof factoryRegistrationSchema>
