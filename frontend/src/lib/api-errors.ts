/**
 * ============================================================================
 * DevMeet Frontend - Standardized API Error Abstraction
 * ============================================================================
 * Defines custom error classes for HTTP API client interactions across DevMeet.
 *
 * Key Architectural Responsibilities:
 * 1. Normalized Error Payload Wrapping:
 *    - Captures the HTTP response status code (e.g. 401, 403, 404, 429, 500).
 *    - Ingests structured JSON error payloads returned by FastAPI microservices
 *      (e.g. `{ detail: "Token expired" }` or `{ errors: [...] }`).
 * 2. Prototype Chain Correction:
 *    - Restores the prototype chain via `Object.setPrototypeOf`, ensuring `instanceof ApiError`
 *      evaluates correctly across transpiled TypeScript environments.
 * ============================================================================
 */

export class ApiError extends Error {
  /** HTTP response status code */
  status: number;
  /** Raw backend error payload or detail object */
  payload: any;

  /**
   * Constructs an ApiError instance.
   *
   * @param status - HTTP response status code.
   * @param message - Human-readable error message.
   * @param payload - Optional backend JSON error body.
   */
  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;

    // Explicitly restore prototype chain in transpiled ES5/ES6 environments
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
