import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Passwords are at least 8 characters"),
});

export const signUpSchema = signInSchema.extend({
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128, "That password is too long"),
});

export const magicLinkSchema = z.object({ email: emailSchema });
