export type DomainErrorCode =
  | "not_found"
  | "invalid_input"
  | "conflict"
  | "forbidden"
  | "unsupported_file"
  | "upstream_unavailable";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} not found`);
export const invalid = (message: string) => new DomainError("invalid_input", message);
export const conflict = (message: string) => new DomainError("conflict", message);
