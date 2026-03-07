import { AxiosError } from "axios";
import { expect } from "vitest";

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
}

export function parseToolResult(result: unknown): unknown {
  expect(result).toBeTypeOf("object");
  expect(result).not.toBeNull();

  const response = result as ToolResponse;
  expect(Array.isArray(response.content)).toBe(true);
  expect(response.content.length).toBeGreaterThan(0);
  expect(response.content[0]).toHaveProperty("type", "text");
  expect(typeof response.content[0].text).toBe("string");

  const text = response.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function assertToolError(result: unknown, expectedSubstring: string): void {
  const parsed = parseToolResult(result);
  expect(typeof parsed).toBe("string");
  expect(parsed as string).toContain(expectedSubstring);
}

export function assertToolSuccess(result: unknown): unknown {
  return parseToolResult(result);
}

export function getToolResponseText(result: unknown): string {
  const response = result as ToolResponse;
  return response.content[0]?.text ?? "";
}

export function makeAxiosError(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status ${status}`);
  error.response = {
    status,
    statusText: String(status),
    data: {},
    headers: {},
    config: error.config ?? ({} as never),
  };
  return error;
}
