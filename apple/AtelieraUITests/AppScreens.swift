import XCTest

// Every screen a UI check visits, each with how to reach it from a fresh launch and
// how to get back. The accessibility audit walks this list; add a screen here when
// you add one to the app.
struct AppScreen {
  let name: String
  let open: (XCUIApplication) -> Void
  let close: (XCUIApplication) -> Void
}

enum AppScreens {
  /// The rooms in Browse, by their `room-<id>` identifier.
  static let rooms = [
    "reflection-garden", "inbox", "journal", "wisdom-garden", "landscape",
    "identity-studio", "uncharted", "current-season", "constellation",
  ]

  static var all: [AppScreen] {
    [
      AppScreen(name: "today", open: { tab($0, .today) }, close: { _ in }),
      AppScreen(
        name: "today-panel",
        open: { app in
          tab(app, .today)
          tap(app.buttons["today-panel-toggle"])
        },
        close: { app in tap(app.buttons["today-panel-toggle"]) }),
      AppScreen(name: "browse", open: { tab($0, .browse) }, close: { _ in }),
    ]
      // The sheets behind the Today card's badges. The cycle badge is only there when the
      // launch sets ATELIERA_UITEST_CYCLE, which the audit does.
      + ["season", "moon", "cycle"].map { rhythm in
        AppScreen(
          name: "badge-\(rhythm)",
          open: { app in
            tab(app, .today)
            let badge = app.buttons["rhythm-badge-\(rhythm)"]
            scrollTo(badge, in: app)
            tap(badge)
            // The sheet covers Today once it has settled; auditing earlier sees both.
            XCTAssertTrue(
              app.staticTexts["rhythm-sheet-\(rhythm)-headline"].waitForExistence(timeout: 10),
              "\(rhythm) sheet never opened")
          },
          close: dismissSheet)
      }
      + rooms.map { room in
        AppScreen(
          name: "room-\(room)",
          open: { app in
            tab(app, .browse)
            let link = app.buttons["room-\(room)"]
            scrollTo(link, in: app)
            tap(link)
          },
          close: back)
      }
      + [
        AppScreen(name: "find", open: { tab($0, .find) }, close: { _ in }),
        AppScreen(
          name: "capture",
          open: { tab($0, .capture) },
          close: dismissSheet),
        AppScreen(
          name: "settings",
          open: { app in
            tab(app, .today)
            tap(app.buttons["settings-button"])
          },
          close: dismissSheet),
        AppScreen(
          name: "profile",
          open: { app in
            tab(app, .today)
            tap(app.buttons["profile-avatar"])
          },
          close: dismissSheet),
        AppScreen(
          name: "rhythm",
          open: { app in
            tab(app, .today)
            let button = app.buttons["rhythm-button"]
            if !button.exists { tap(app.buttons["today-panel-toggle"]) }
            scrollTo(button, in: app)
            tap(button)
          },
          close: dismissSheet),
        AppScreen(
          name: "sky-ahead",
          open: { app in
            tab(app, .today)
            let button = app.buttons["sky-ahead-button"]
            if !button.exists { tap(app.buttons["today-panel-toggle"]) }
            scrollTo(button, in: app)
            tap(button)
          },
          close: dismissSheet),
      ]
  }

  /// The tabs, by position: their labels change with the language and with doubled strings.
  enum Tab: Int { case today, browse, capture, find }

  static func tab(_ app: XCUIApplication, _ tab: Tab) {
    tap(app.tabBars.buttons.element(boundBy: tab.rawValue))
  }

  static func tap(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(
      element.waitForExistence(timeout: 10), "\(element) never appeared", file: file, line: line)
    element.tap()
  }

  static func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
    var swipes = 0
    while !element.isHittable && swipes < 8 {
      app.swipeUp()
      swipes += 1
    }
  }

  /// Swipes down until nothing on screen moves, so the next screen starts from the top.
  static func scrollToTop(_ app: XCUIApplication) {
    for _ in 0..<8 {
      let before = app.debugDescription
      app.swipeDown()
      if app.debugDescription == before { return }
    }
  }

  static func back(_ app: XCUIApplication) {
    app.navigationBars.buttons.element(boundBy: 0).tap()
  }

  // Matches by the start of the label, because doubled strings turn "Done" into "Done Done".
  static func dismissSheet(_ app: XCUIApplication) {
    for label in ["Done", "Cancel", "Close"] {
      let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label))
        .firstMatch
      if button.exists {
        button.tap()
        return
      }
    }
    app.swipeDown(velocity: .fast)
  }
}
