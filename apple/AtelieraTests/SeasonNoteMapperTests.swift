import XCTest

@testable import Ateliera

// P6 (Season): the note mapper — byte-identical markdown/letter + full round-trip,
// golden-matched to season-service.ts (bytes captured from the web serializer).
final class SeasonNoteMapperTests: XCTestCase {
  private func filledState() -> SeasonState {
    var s = SeasonEngine.createDraft(id: "SEASON01", now: "2026-06-01T00:00:00.000Z")
    s.title = "Spring"
    s.startsOn = "2026-03-01"
    s.endsOn = "2026-05-31"
    s.statement = "tending"
    s.status = .active
    s.priorReflection = "looked back"
    s.feelings = ["calm", "brave"]
    s.priorities = ["n1", "n2"]
    s.decisions = [SeasonDecision(id: "d1", text: "move", horizon: .d30, kind: .decision)]
    s.practices = ["walk"]
    s.supports = ["mornings"]
    s.constraints = ["no calls"]
    s.enough = "one true thing"
    s.notNow = ["everything else"]
    s.completedSteps = [.nameDates, .feelings]
    return s
  }

  func testMarkdownForSeasonGolden() {
    var s = SeasonEngine.createDraft(id: "X", now: "2026-06-01T00:00:00.000Z")
    s.statement = "tending"
    s.feelings = ["calm", "brave"]
    s.enough = "one true thing"
    s.practices = ["walk"]
    s.supports = ["mornings"]
    s.constraints = ["no calls"]
    s.notNow = ["rush"]
    let expected = """
      This is a season of tending

      ## How I want it to feel

      calm · brave

      ## Enough

      one true thing

      ## Practices

      - walk

      ## Support

      - mornings
      - Constraint: no calls

      ## Not now

      - rush
      """ + "\n"
    XCTAssertEqual(SeasonNoteMapper.markdownForSeason(s), expected)
  }

  func testSeasonLetterBodyGolden() {
    var s = SeasonEngine.createDraft(id: "X", now: "2026-06-01T00:00:00.000Z")
    s.title = "Spring"
    let reflection = SeasonCloseReflection(
      celebration: "we did", learning: "a lot", identity: "braver",
      dispositions: [
        SeasonCloseDisposition(noteId: "a", title: "Priority A", disposition: "return-landscape")
      ])
    let expected = """
      # A letter from Spring

      ## What I celebrate

      we did

      ## What I learned

      a lot

      ## Who I became

      braver

      ## Where each thread rests

      - Priority A: return landscape
      """ + "\n"
    XCTAssertEqual(SeasonNoteMapper.seasonLetterBody(s, reflection), expected)
  }

  func testCreateSeasonNoteSerializesToGoldenBytes() {
    let note = SeasonNoteMapper.createSeasonNote(filledState(), id: "SEASON01")
    // The exact bytes captured from the web serializeNote(noteWithState(...)).
    let expected = """
      ---
      season_id: SEASON01
      date_start: 2026-03-01
      date_end: 2026-05-31
      priorities:
        - n1
        - n2
      season_workflow:
        statement: tending
        prior_reflection: looked back
        skipped_prior_reflection: false
        feelings:
          - calm
          - brave
        decisions:
          - id: d1
            text: move
            horizon: "30"
            kind: decision
        practices:
          - walk
        supports:
          - mornings
        constraints:
          - no calls
        enough: one true thing
        not_now:
          - everything else
        mid_season_notes: []
        completed_steps:
          - name-dates
          - feelings
      schema_version: 1
      id: SEASON01
      title: Spring
      card_type: season
      semantic_type: growth
      status: active
      rooms:
        - current-season
        - foyer
      life_areas: []
      seasons: []
      tags:
        - season
      created: 2026-06-01T00:00:00.000Z
      updated: 2026-06-01T00:00:00.000Z
      attachments: []
      display:
        featured: false
      privacy:
        sensitivity: private
        ai_access: ask
      ---

      """ + markdownBody()
    XCTAssertEqual(note.serialize(), expected)
  }

  private func markdownBody() -> String {
    SeasonNoteMapper.markdownForSeason(filledState())
  }

  func testRoundTripRecoversState() throws {
    let note = SeasonNoteMapper.createSeasonNote(filledState(), id: "SEASON01")
    let serialized = note.serialize()
    let parsed = try XCTUnwrap(NoteParser.parse(serialized))
    // Byte round-trip (unchanged note re-serializes identically).
    XCTAssertEqual(parsed.serialize(), serialized)
    // And the state is recovered, including the structured decision.
    let recovered = SeasonNoteMapper.stateFromNote(parsed)
    XCTAssertEqual(recovered.title, "Spring")
    XCTAssertEqual(recovered.startsOn, "2026-03-01")
    XCTAssertEqual(recovered.feelings, ["calm", "brave"])
    XCTAssertEqual(recovered.priorities, ["n1", "n2"])
    XCTAssertEqual(recovered.decisions, [SeasonDecision(id: "d1", text: "move", horizon: .d30, kind: .decision)])
    XCTAssertEqual(recovered.completedSteps, [.nameDates, .feelings])
    XCTAssertEqual(recovered.status, .active)
  }

  func testUnknownWorkflowKeysDoNotBreakRecovery() throws {
    // A season note with an extra unknown key survives the round trip.
    var note = SeasonNoteMapper.createSeasonNote(filledState(), id: "SEASON01")
    note.extraFrontmatter.insert(("custom_key", .scalar("kept")), at: 0)
    let parsed = try XCTUnwrap(NoteParser.parse(note.serialize()))
    XCTAssertEqual(parsed.serialize(), note.serialize())
    XCTAssertTrue(parsed.extraFrontmatter.contains { $0.0 == "custom_key" })
  }
}
