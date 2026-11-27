import { TProfileIdentityFormSchema } from "@/features/profile/lib/profile-identity-form";
import { z } from "zod";

const TOnboardingProfileSchema = TProfileIdentityFormSchema.extend({
  coreSkills: z
    .array(z.string().transform((value) => value.trim().replace(/\s+/g, " ")))
    .transform((skills) => {
      const deduped = new Map<string, string>();
      for (const skill of skills) {
        if (skill.length > 0) deduped.set(skill.toLowerCase(), skill);
      }
      return Array.from(deduped.values());
    })
    .pipe(z.array(z.string().min(1).max(40, "Each skill must be 40 characters or less.")).max(10))
    .default([]),
});

export const TOnboardingFormSchema = TOnboardingProfileSchema.extend({
  email: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Email is required.")
        .max(254, "Email must be 254 characters or less.")
        .email("Enter a valid email address."),
    ),
});

export type TOnboardingFormValues = z.input<typeof TOnboardingFormSchema>;
export type TSanitizedOnboardingFormValues = z.output<typeof TOnboardingFormSchema>;
