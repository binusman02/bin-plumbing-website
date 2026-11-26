import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  embedPlumberMetaInNotes,
  mapPlumberRow,
  parsePlumberMetaFromNotes,
} from "../src/lib/marketplace";

describe("plumber availability and onboarding metadata persistence", () => {
  it("embeds and parses availability and onboarding metadata while preserving [BANK_JSON:...]", () => {
    const existingNotes =
      'Field note [BANK_JSON:{"bankName":"Access","accountNumber":"0123456789","accountName":"Abdurrahman Garba"}]';
    const updatedNotes = embedPlumberMetaInNotes(existingNotes, {
      availability: "Weekdays & Saturdays (8am-6pm)",
      onboardingNotes: "Verified NIN and trade references",
      agreementUrl: "AGR-2026-009",
      checklist: {
        id_checked: { checked: true, date: "2026-11-26T10:00:00.000Z" },
        references_checked: { checked: true, date: "2026-11-26T10:00:00.000Z" },
        agreement_signed: { checked: true, date: "2026-11-26T10:00:00.000Z" },
      },
    });

    assert.ok(updatedNotes.includes("[BANK_JSON:"));
    assert.ok(updatedNotes.includes("[AVAILABILITY:Weekdays & Saturdays (8am-6pm)]"));

    const parsed = parsePlumberMetaFromNotes(updatedNotes);
    assert.equal(parsed.availability, "Weekdays & Saturdays (8am-6pm)");
    assert.equal(parsed.onboardingNotes, "Verified NIN and trade references");
    assert.equal(parsed.agreementUrl, "AGR-2026-009");
    assert.equal(parsed.checklist?.id_checked?.checked, true);

    const mapped = mapPlumberRow({
      id: "plumber-1",
      full_name: "Abdurrahman Garba",
      phone: "09064172328",
      residential_location: "Kano",
      preferred_locations: ["Hotoro"],
      skills: ["General Plumbing"],
      experience_years: 3,
      verification_status: "submitted",
      is_available: true,
      rating: 5,
      total_jobs: 0,
      notes: updatedNotes,
      created_at: "2026-11-26T09:00:00.000Z",
    });

    assert.equal(mapped.availability, "Weekdays & Saturdays (8am-6pm)");
    assert.equal(mapped.onboarding_notes, "Verified NIN and trade references");
    assert.equal(mapped.agreement_url, "AGR-2026-009");
    assert.equal(mapped.verification_checklist?.agreement_signed?.checked, true);
    assert.equal(mapped.notes, "Field note");
  });

  it("reads legacy 'Availability: ...' lines cleanly", () => {
    const mapped = mapPlumberRow({
      id: "plumber-2",
      full_name: "Test Plumber",
      phone: "08012345678",
      notes: "Availability: Full-time (Mon-Sat)",
      created_at: "2026-11-26T09:00:00.000Z",
    });
    assert.equal(mapped.availability, "Full-time (Mon-Sat)");
  });
});
