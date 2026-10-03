import XCTest

@testable import Ateliera

// A note is one piece of text: new notes carry no separate title, so the display must
// not show a derived "title" line and then repeat it as an excerpt. These cover the
// shared `hasExplicitTitle` signal and the card models that carry it through to the view.
final class SingleTextNoteDisplayTests: XCTestCase {
  private let created = "2026-01-01T00:00:00.000Z"

  private func make(id: String, title: String?, body: String) -> StudioNote {
    var n = StudioNote.capture(title: title, body: body, id: id, created: created, room: "inbox")
    n.status = "active"
    return n
  }

  private func loaded(
    id: String, title: String?, body: String, rooms: [String] = ["uncharted"],
    semanticType: String = "uncharted", cardType: String = "possibility"
  ) -> Projection.Loaded {
    var n = make(id: id, title: title, body: body)
    n.rooms = rooms
    n.semanticType = semanticType
    n.cardType = cardType
    return (path: "\(id).md", note: n)
  }

  // MARK: hasExplicitTitle

  func testHasExplicitTitleTrueForNonEmptyTitle() {
    XCTAssertTrue(Projection.hasExplicitTitle(make(id: "A", title: "A name", body: "the body")))
  }

  func testHasExplicitTitleFalseForNilTitle() {
    XCTAssertFalse(Projection.hasExplicitTitle(make(id: "A", title: nil, body: "the body")))
  }

  func testHasExplicitTitleFalseForWhitespaceOnlyTitle() {
    // Even if a whitespace title slipped past (set directly), the signal reads it as absent.
    var n = make(id: "A", title: nil, body: "the body")
    n.title = "   "
    XCTAssertFalse(Projection.hasExplicitTitle(n))
  }

  // MARK: Uncharted cards

  func testUnchartedCardWithoutExplicitTitleFlagsNoTitle() {
    let card = UnchartedProjection.project(
      notes: [loaded(id: "A", title: nil, body: "learning to sail")]
    ).first
    XCTAssertEqual(card?.title, "learning to sail")  // derived from the body
    XCTAssertFalse(card?.hasExplicitTitle ?? true)
  }

  func testUnchartedCardWithExplicitTitleFlagsTitle() {
    let card = UnchartedProjection.project(
      notes: [loaded(id: "A", title: "Sailing", body: "learning to sail")]
    ).first
    XCTAssertEqual(card?.title, "Sailing")
    XCTAssertTrue(card?.hasExplicitTitle ?? false)
  }

  // MARK: Identity / becoming models

  func testIdentityCardCarriesHasExplicitTitle() {
    let withTitle = loaded(
      id: "I1", title: "I keep my word", body: "and I mean it",
      rooms: ["identity-studio"], semanticType: "growth", cardType: "identity-truth")
    let withoutTitle = loaded(
      id: "I2", title: nil, body: "I rest without guilt",
      rooms: ["identity-studio"], semanticType: "growth", cardType: "identity-truth")
    let board = IdentityProjector.project(notes: [withTitle, withoutTitle])
    let cards = board.sections[.alreadyTrue] ?? []
    let c1 = cards.first { $0.id == "I1" }
    let c2 = cards.first { $0.id == "I2" }
    XCTAssertEqual(c1?.hasExplicitTitle, true)
    XCTAssertEqual(c2?.hasExplicitTitle, false)
  }

  func testBecomingModelCarriesHasExplicitTitle() {
    let becoming = loaded(
      id: "B", title: nil, body: "someone who rests",
      rooms: ["foyer", "identity-studio"], semanticType: "growth", cardType: "identity")
    let board = IdentityProjector.project(notes: [becoming])
    XCTAssertEqual(board.activeBecomings.first?.hasExplicitTitle, false)
    XCTAssertEqual(board.activeBecomings.first?.title, "someone who rests")
  }

  // MARK: Shared row summary (Browse / Journal / Inbox)

  func testSummaryWithoutTitleShowsTextOnceAsTitle() {
    let n = make(id: "A", title: nil, body: "A single line of text.")
    let summary = VaultStore.summary(from: n, path: "Inbox/a-single-line.md")
    // The one piece of text becomes the row title; the snippet is dropped so it
    // isn't repeated beneath.
    XCTAssertFalse(summary.hasExplicitTitle)
    XCTAssertEqual(summary.title, "A single line of text.")
    XCTAssertEqual(summary.snippet, "")
  }

  func testSummaryWithTitleKeepsTitleAndSnippet() {
    let n = make(id: "A", title: "A name", body: "the body line")
    let summary = VaultStore.summary(from: n, path: "Inbox/a-name.md")
    XCTAssertTrue(summary.hasExplicitTitle)
    XCTAssertEqual(summary.title, "A name")
    XCTAssertEqual(summary.snippet, "the body line")
  }

  // MARK: Foyer hero model

  func testFoyerHeroShowsBecomingStatement() {
    // A becoming with no explicit title: the statement is the text, nothing more.
    let board = IdentityBoardModel(
      currentlyBecoming: nil, sections: [:],
      activeBecomings: [
        BecomingModel(
          id: "B", path: "B.md", title: "Someone who rests", excerpt: "Someone who rests",
          lifeAreaId: nil, created: "2026-01-01T00:00:00.000Z", hasExplicitTitle: false)
      ])
    guard case .becoming(let statement, let path) = FoyerHeroModel(board) else {
      return XCTFail("expected a becoming hero")
    }
    XCTAssertEqual(statement, "Someone who rests")
    XCTAssertEqual(path, "B.md")
  }

  func testFoyerHeroShowsOnlyTheStatementEvenWithExplicitTitleAndBody() {
    // The regression this guards: a web-authored becoming carries an explicit title AND a
    // body, but the hero is a statement — it must not surface the body paragraph beneath.
    let board = IdentityBoardModel(
      currentlyBecoming: IdentityCardModel(
        id: "PN", path: "PN.md", title: "Someone who rests", excerpt: "A gentler pace.",
        semanticType: "growth", hash: "", created: "2026-01-01T00:00:00.000Z", evidence: [],
        hasExplicitTitle: true),
      sections: [:])
    guard case .becoming(let statement, let path) = FoyerHeroModel(board) else {
      return XCTFail("expected a becoming hero")
    }
    // Only the statement + path are carried; the body excerpt is not part of the hero.
    XCTAssertEqual(statement, "Someone who rests")
    XCTAssertEqual(path, "PN.md")
  }
}
