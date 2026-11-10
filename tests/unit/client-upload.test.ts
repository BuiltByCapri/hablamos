import { describe, expect, it } from "vitest";
import { REQUEST_LIMIT_BYTES, uploadVerdict } from "../../lib/client-upload";

describe("uploadVerdict", () => {
  it("lets a small file of any type through", () => {
    expect(uploadVerdict({ size: 1000, type: "application/pdf" })).toBe("ok");
    expect(uploadVerdict({ size: REQUEST_LIMIT_BYTES - 1, type: "image/png" })).toBe("ok");
  });

  it("shrinks a large photo", () => {
    expect(uploadVerdict({ size: 8_000_000, type: "image/jpeg" })).toBe("shrink");
  });

  it("turns away a large PDF, document or text file", () => {
    expect(uploadVerdict({ size: 5_000_000, type: "application/pdf" })).toBe("too_large");
    expect(uploadVerdict({ size: REQUEST_LIMIT_BYTES, type: "text/plain" })).toBe("too_large");
  });
});
