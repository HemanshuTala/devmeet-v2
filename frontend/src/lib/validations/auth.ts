/**
 * ============================================================================
 * DevMeet Frontend - Client-Side Authentication Form Validation Schemas
 * ============================================================================
 * Provides runtime input validation using Zod for login, registration,
 * and credential rotation forms.
 *
 * Security & Validation Rules:
 * 1. Email Format: Asserts standard RFC email format and non-empty string.
 * 2. Enterprise Password Complexity:
 *    - Minimum length: 8 characters.
 *    - At least one uppercase letter ([A-Z]).
 *    - At least one lowercase letter ([a-z]).
 *    - At least one digit ([0-9]).
 *    - At least one special symbol.
 * 3. Cross-Field Confirmation:
 *    - Enforces `.refine()` match between password and confirmPassword fields.
 * ============================================================================
 */

import { z } from 'zod';

/**
 * Validation schema for the candidate login form.
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Common reusable password complexity schema enforcing entropy and character diversity.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[0-9]/, 'Include at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Include at least one special character');

/**
 * Validation schema for new candidate account registration.
 */
export const registerSchema = z
  .object({
    display_name: z
      .string()
      .min(2, 'Display name must be at least 2 characters')
      .max(50, 'Display name is too long'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

/**
 * Validation schema for authenticated user password change dialogs.
 */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
